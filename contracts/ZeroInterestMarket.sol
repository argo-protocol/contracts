//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { IOracle } from "./interfaces/IOracle.sol";
import { IMarket } from "./interfaces/IMarket.sol";
import { IDebtToken } from "./interfaces/IDebtToken.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * A lending market that only supports a flat borrow fee and no interest rate
 *
 * TODO: Create this using a factory
 */
contract ZeroInterestMarket is Ownable, IMarket {
    using SafeERC20 for IERC20;
    using SafeERC20 for IDebtToken;

    // Events
    event Deposit(address indexed from, address indexed to, uint256 amount);
    event Withdraw(address indexed from, address indexed to, uint256 amount);
    event Borrow(address indexed from, address indexed to, uint256 amount);
    event Repay(address indexed from, address indexed to, uint256 amount);
    event Liquidate(address indexed from, address indexed to, uint256 repayDebt, uint256 liquidatedCollateral);
    event TreasuryUpdated(address newTreasury);

    uint256 internal constant MAX_INT = 2**256 - 1;

    address public treasury;
    IERC20 public collateralToken;
    IDebtToken public debtToken;

    IOracle public oracle;
    uint256 public lastPrice;
    uint256 public constant LAST_PRICE_PRECISION = 1e18;

    uint256 public feesCollected;

    uint256 public maxLoanToValue;
    uint256 public constant LOAN_TO_VALUE_PRECISION = 1e5;
    uint256 public borrowRate;
    uint256 public constant BORROW_RATE_PRECISION = 1e5;
    uint256 public liquidationPenalty;
    uint256 public constant LIQUIDATION_PENALTY_PRECISION = 1e5;

    mapping(address => uint256) public userCollateral;
    mapping(address => uint256) public userDebt;
    uint256 public totalCollateral;
    uint256 public totalDebt;

    constructor(
        address _treasury,
        address _collateralToken,
        address _debtToken,
        address _oracle,
        uint256 _maxLoanToValue,
        uint256 _borrowRate,
        uint256 _liquidationPenalty
    ) {
        treasury = _treasury;
        collateralToken = IERC20(_collateralToken);
        debtToken = IDebtToken(_debtToken);
        oracle = IOracle(_oracle);
        maxLoanToValue = _maxLoanToValue;
        borrowRate = _borrowRate;
        liquidationPenalty = _liquidationPenalty;
    }

    /**
     * @notice Deposits `_amount` of collateral to the `_to` account.
     * @param _to the account that receives the collateral
     * @param _amount the amount of collateral tokens
     */
    function deposit(address _to, uint256 _amount) public override {
        userCollateral[_to] = userCollateral[_to] + _amount;
        totalCollateral = totalCollateral + _amount;

        collateralToken.safeTransferFrom(msg.sender, address(this), _amount);

        emit Deposit(msg.sender, _to, _amount);
    }

    /**
     * @notice Withdraws `_amount` of collateral tokens from msg.sender and sends them to the `_to` address.
     * @param _to the account that receives the collateral
     * @param _amount the amount of collateral tokens
     */
    function withdraw(address _to, uint256 _amount) public override {
        require(_amount <= userCollateral[msg.sender], "Market: withdrawal exceeds collateral balance");
        _updatePrice();

        userCollateral[msg.sender] = userCollateral[msg.sender] - _amount;
        totalCollateral = totalCollateral - _amount;

        require(isUserSolvent(msg.sender), "Market: exceeds Loan-to-Value");

        emit Withdraw(msg.sender, _to, _amount);
        collateralToken.safeTransfer(_to, _amount);
    }

    /**
     * @notice Borrows `_amount` of debt tokens against msg.sender's collateral and sends them to the `_to` address
     * Requires that `msg.sender`s account is solvent and will request a price update from the oracle.
     * @param _to the reciever of the debt tokens
     * @param _amount the amount of debt to incur
     */
    function borrow(address _to, uint256 _amount) public override {
        _updatePrice();

        uint256 borrowRateFee = (_amount * borrowRate) / BORROW_RATE_PRECISION;
        totalDebt = totalDebt + _amount + borrowRateFee;
        userDebt[msg.sender] = userDebt[msg.sender] + _amount + borrowRateFee;

        require(isUserSolvent(msg.sender), "Market: exceeds Loan-to-Value");

        feesCollected = feesCollected + borrowRateFee;
        emit Borrow(msg.sender, _to, _amount);
        debtToken.safeTransfer(_to, _amount);
    }

    /**
     * @notice Repays `_amount` of the `_to` user's outstanding loan by transferring debt tokens from msg.sender
     * @param _to the user's account to repay
     * @param _amount the amount of tokens to repay
     */
    function repay(address _to, uint256 _amount) public override {
        require(_amount <= userDebt[_to], "Market: repay exceeds debt");
        totalDebt = totalDebt - _amount;
        userDebt[_to] = userDebt[_to] - _amount;

        debtToken.safeTransferFrom(msg.sender, address(this), _amount);

        emit Repay(msg.sender, _to, _amount);
    }

    /**
     * @notice Convienence function to deposit collateral and borrow debt tokens to the account of msg.sender
     * @param _depositAmount amount of collateral tokens to deposit
     * @param _borrowAmount amount of debt to incur
     */
    function depositAndBorrow(uint256 _depositAmount, uint256 _borrowAmount) external override {
        deposit(msg.sender, _depositAmount);
        borrow(msg.sender, _borrowAmount);
    }

    /**
     * @notice Convenience function to repay debt and withdraw collateral for the account of msg.sender
     * @param _repayAmount amount of debt to repay
     * @param _withdrawAmount amount of collateral to withdraw
     */
    function repayAndWithdraw(uint256 _repayAmount, uint256 _withdrawAmount) external override {
        repay(msg.sender, _repayAmount);
        withdraw(msg.sender, _withdrawAmount);
    }

    /**
     * @notice Liquidate `_maxAmount` of a user's collateral who's loan-to-value ratio exceeds limit.
     * Debt tokens provided by `msg.sender` and liquidated collateral sent to `_to`.
     * Reverts if user is solvent.
     * @param _user the account to liquidate
     * @param _maxAmount the maximum amount of debt the liquidator is willing to repay
     * @param _to the address that will receive the liquidated collateral
     */
    function liquidate(
        address _user,
        uint256 _maxAmount,
        address _to
    ) external override {
        uint256 price = _updatePrice();

        require(!isUserSolvent(_user), "Market: user solvent");

        uint256 userCollValue = (userCollateral[_user] * price) / LAST_PRICE_PRECISION;
        uint256 userDebtAmount = userDebt[_user];
        uint256 repayAmount;
        if (userCollValue < userDebtAmount) {
            // there isn't enough collateral to repay all the debt
            // TODO: determine if this is really the right thing to do
            uint256 beforeFeeAmount = (userCollValue * LIQUIDATION_PENALTY_PRECISION) /
                (LIQUIDATION_PENALTY_PRECISION + liquidationPenalty);
            repayAmount = _maxAmount > beforeFeeAmount ? beforeFeeAmount : _maxAmount;
        } else {
            // all debt can be repaid
            repayAmount = userDebtAmount > _maxAmount ? _maxAmount : userDebtAmount;
        }

        uint256 userCollLiq = (repayAmount * LAST_PRICE_PRECISION) / price;
        uint256 userLiqPenalty = (userCollLiq * liquidationPenalty) / LIQUIDATION_PENALTY_PRECISION;
        uint256 liquidatedCollateral = userCollLiq + userLiqPenalty;

        userCollateral[_user] = userCollateral[_user] - liquidatedCollateral;
        totalCollateral = totalCollateral - liquidatedCollateral;
        userDebt[_user] = userDebt[_user] - repayAmount;
        totalDebt = totalDebt - repayAmount;

        debtToken.safeTransferFrom(msg.sender, address(this), repayAmount);

        emit Liquidate(msg.sender, _to, repayAmount, liquidatedCollateral);
        collateralToken.safeTransfer(_to, liquidatedCollateral);
    }

    /**
     * @notice Harvests fees collected to the treasury
     */
    function harvestFees() external {
        uint256 fees = feesCollected;
        feesCollected = 0;

        debtToken.safeTransfer(treasury, fees);
    }

    /**
     * @notice updates the current price of the collateral and saves it in `lastPrice`.
     * @return the price
     */
    function updatePrice() external override returns (uint256) {
        return _updatePrice();
    }

    function _updatePrice() internal returns (uint256) {
        (bool success, uint256 price) = oracle.fetchPrice();
        if (success) {
            lastPrice = price;
            // TODO: emit event
        }
        return lastPrice;
    }

    /**
     * @notice reduces the available supply to be borrowed by transferring debt tokens to owner.
     * @param _amount number of tokens to remove
     */
    function reduceSupply(uint256 _amount) external onlyOwner {
        debtToken.safeTransfer(this.owner(), _amount);
    }

    /**
     * @notice updates the treasury that receives the fees
     * @param _treasury address of the new treasury
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Market: 0x0 treasury address");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    //////
    /// View Functions
    //////
    function getUserLTV(address _user) public view override returns (uint256) {
        if (userDebt[_user] == 0) return 0;
        if (userCollateral[_user] == 0) return MAX_INT;
        //  console.log("LTV", userDebt[_user] * LOAN_TO_VALUE_PRECISION / (userCollateral[_user] * lastPrice / LAST_PRICE_PRECISION));
        return
            (userDebt[_user] * LOAN_TO_VALUE_PRECISION) / ((userCollateral[_user] * lastPrice) / LAST_PRICE_PRECISION);
    }

    function isUserSolvent(address _user) public view override returns (bool) {
        return getUserLTV(_user) <= maxLoanToValue;
    }
}
