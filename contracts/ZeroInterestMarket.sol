//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { IOracle } from "./interfaces/IOracle.sol";
import { IMarket } from "./interfaces/IMarket.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "hardhat/console.sol";

/**
 * A lending market that only supports a flat borrow fee and no interest rate
 * 
 * TODO: Create this using a factory
 */
contract ZeroInterestMarket is IMarket {
    using SafeERC20 for IERC20;


    // Events
    event Deposit(address indexed from, address indexed to, uint256 amount);
    event Withdraw(address indexed from, address indexed to, uint256 amount);
    event Borrow(address indexed from, address indexed to, uint256 amount);
    event Repay(address indexed from, address indexed to, uint256 amount);
    event Liquidate(address indexed from, address indexed to, uint256 repayDebt, uint256 liquidatedCollateral);

    uint constant internal MAX_INT = 2**256 - 1;

    address public treasury;
    IERC20 public collateralToken;
    IERC20 public debtToken;

    IOracle public oracle;
    uint public lastPrice;
    uint constant public LAST_PRICE_PRECISION = 1e18;

    uint public feesCollected;

    uint public maxLoanToValue;
    uint constant public LOAN_TO_VALUE_PRECISION = 1e5;
    uint public borrowRate;
    uint constant public BORROW_RATE_PRECISION = 1e5;
    uint public liquidationPenalty;
    uint constant public LIQUIDATION_PENALTY_PRECISION = 1e5;

    mapping(address => uint) public userCollateral;
    mapping(address => uint) public userDebt;
    uint public totalCollateral;
    uint public totalDebt;

    constructor(address _treasury, address _collateralToken, address _debtToken, address _oracle, uint _maxLoanToValue, uint _borrowRate, uint _liquidationPenalty) {
        treasury = _treasury;
        collateralToken = IERC20(_collateralToken);
        debtToken = IERC20(_debtToken);
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
    function deposit(address _to, uint _amount) public override {
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
    function withdraw(address _to, uint _amount) public override {
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
    function borrow(address _to, uint _amount) public override {
        _updatePrice();

        uint borrowRateFee = _amount * borrowRate / BORROW_RATE_PRECISION;
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
    function repay(address _to, uint _amount) public override {
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
    function depositAndBorrow(uint _depositAmount, uint _borrowAmount) external override {
        deposit(msg.sender, _depositAmount);
        borrow(msg.sender, _borrowAmount);
    }

    /**
     * @notice Convenience function to repay debt and withdraw collateral for the account of msg.sender
     * @param _repayAmount amount of debt to repay
     * @param _withdrawAmount amount of collateral to withdraw
     */
    function repayAndWithdraw(uint _repayAmount, uint _withdrawAmount) external override {
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
    function liquidate(address _user, uint _maxAmount, address _to) external override {
        uint price = _updatePrice();

        require(!isUserSolvent(_user), "Market: user solvent");

        uint userCollValue = userCollateral[_user] * price /  LAST_PRICE_PRECISION;
        uint userDebtAmount = userDebt[_user];
        uint repayAmount;
        if (userCollValue < userDebtAmount) {
            // there isn't enough collateral to repay all the debt
            // TODO: determine if this is really the right thing to do
            uint beforeFeeAmount = userCollValue * LIQUIDATION_PENALTY_PRECISION / (LIQUIDATION_PENALTY_PRECISION + liquidationPenalty);
            repayAmount = _maxAmount > beforeFeeAmount ? beforeFeeAmount : _maxAmount;
        } else {
            // all debt can be repaid
            repayAmount = userDebtAmount > _maxAmount ? _maxAmount : userDebtAmount;
        }

        uint userCollLiq = repayAmount * LAST_PRICE_PRECISION / price;
        uint userLiqPenalty = userCollLiq * liquidationPenalty / LIQUIDATION_PENALTY_PRECISION;
        uint liquidatedCollateral = userCollLiq + userLiqPenalty;

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
        uint fees = feesCollected;
        feesCollected = 0;

        debtToken.safeTransfer(treasury, fees);
    }

    /**
     * @notice updates the current price of the collateral and saves it in `lastPrice`.
     * @return the price
     */
    function updatePrice() external override returns (uint) {
        return _updatePrice();
    }

    function _updatePrice() internal returns (uint) {
        lastPrice = oracle.fetchPrice();
        // TODO: emit event
        return lastPrice;
    }

    //////
    /// View Functions
    //////
    function getUserLTV(address _user) public view override returns (uint) {
        if (userDebt[_user] == 0) return 0;
        if (userCollateral[_user] == 0) return MAX_INT;
        //  console.log("LTV", userDebt[_user] * LOAN_TO_VALUE_PRECISION / (userCollateral[_user] * lastPrice / LAST_PRICE_PRECISION));
        return userDebt[_user] * LOAN_TO_VALUE_PRECISION / (userCollateral[_user] * lastPrice / LAST_PRICE_PRECISION);
    }

    function isUserSolvent(address _user) public view override returns (bool) {
        return getUserLTV(_user) <= maxLoanToValue;
    }
}