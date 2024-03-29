// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

//
//        ___           ___           ___           ___
//       /\  \         /\  \         /\__\         /\  \
//      /::\  \       /::\  \       /:/ _/_       /::\  \
//     /:/\:\  \     /:/\:\__\     /:/ /\  \     /:/\:\  \
//    /:/ /::\  \   /:/ /:/  /    /:/ /::\  \   /:/  \:\  \
//   /:/_/:/\:\__\ /:/_/:/__/___ /:/__\/\:\__\ /:/__/ \:\__\
//   \:\/:/  \/__/ \:\/:::::/  / \:\  \ /:/  / \:\  \ /:/  /
//    \::/__/       \::/~~/~~~~   \:\  /:/  /   \:\  /:/  /
//     \:\  \        \:\~~\        \:\/:/  /     \:\/:/  /
//      \:\__\        \:\__\        \::/  /       \::/  /
//       \/__/         \/__/         \/__/         \/__/
//

import { IOracle } from "./interfaces/IOracle.sol";
import { IMarket } from "./interfaces/IMarket.sol";
import { IDebtToken } from "./interfaces/IDebtToken.sol";
import { IFlashSwap } from "./interfaces/IFlashSwap.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";

/**
 * A lending market that only supports a flat borrow fee and no interest rate
 */
contract ZeroInterestMarket is Ownable, Initializable, IMarket, Pausable {
    using SafeERC20 for IERC20;
    using SafeERC20 for IDebtToken;

    // Events
    event Deposit(address indexed from, address indexed to, uint256 amount);
    event Withdraw(address indexed from, address indexed to, uint256 amount);
    event Borrow(address indexed from, address indexed to, uint256 amount);
    event Repay(address indexed from, address indexed to, uint256 amount);
    event Liquidate(
        address indexed from,
        address indexed to,
        uint256 repayDebt,
        uint256 liquidatedCollateral,
        uint256 liquidationPrice
    );
    event TreasuryUpdated(address newTreasury);
    event LastPriceUpdated(uint price);
    event FeesHarvested(uint fees);

    // Maximum time period allowed since Chainlink's latest round data timestamp, beyond which Chainlink is considered frozen.
    uint public constant ORACLE_MAX_TIMEOUT = 1 hours;

    address public treasury;
    IERC20 public collateralToken;
    IDebtToken public debtToken;

    IOracle public oracle;
    uint public lastPrice;
    uint public lastPriceTime;
    uint public constant LAST_PRICE_PRECISION = 1e18;

    uint public feesCollected;

    uint public maxLoanToValue;
    uint public constant LOAN_TO_VALUE_PRECISION = 1e5;
    uint public borrowRate;
    uint public constant BORROW_RATE_PRECISION = 1e5;
    uint public liquidationPenalty;
    uint public constant LIQUIDATION_PENALTY_PRECISION = 1e5;

    mapping(address => uint) public userCollateral;
    mapping(address => uint) public userDebt;
    uint public totalCollateral;
    uint public totalDebt;

    function initialize(
        address _owner,
        address _treasury,
        address _collateralToken,
        address _debtToken,
        address _oracle,
        uint256 _maxLoanToValue,
        uint256 _borrowRate,
        uint256 _liquidationPenalty
    ) public initializer {
        treasury = _treasury;
        collateralToken = IERC20(_collateralToken);
        debtToken = IDebtToken(_debtToken);
        oracle = IOracle(_oracle);
        maxLoanToValue = _maxLoanToValue;
        borrowRate = _borrowRate;
        liquidationPenalty = _liquidationPenalty;
        Ownable._transferOwnership(_owner);

        emit TreasuryUpdated(_treasury);
    }

    /**
     * @notice Deposits `_amount` of collateral to the `_to` account.
     * @param _to the account that receives the collateral
     * @param _amount the amount of collateral tokens
     */
    function deposit(address _to, uint _amount) public override whenNotPaused {
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
    function withdraw(address _to, uint _amount) public override whenNotPaused {
        require(_amount <= userCollateral[msg.sender], "Market: amount too large");

        _updatePrice(true);

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
    function borrow(address _to, uint _amount) public override whenNotPaused {
        _updatePrice(true);

        uint borrowRateFee = (_amount * borrowRate) / BORROW_RATE_PRECISION;
        uint amountPlusFee = _amount + borrowRateFee;
        totalDebt = totalDebt + amountPlusFee;
        userDebt[msg.sender] = userDebt[msg.sender] + amountPlusFee;

        require(isUserSolvent(msg.sender), "Market: exceeds Loan-to-Value");

        feesCollected = feesCollected + borrowRateFee;
        emit Borrow(msg.sender, _to, amountPlusFee);
        debtToken.safeTransfer(_to, _amount);
    }

    /**
     * @notice Repays `_amount` of the `_to` user's outstanding loan by transferring debt tokens from msg.sender
     * @param _to the user's account to repay
     * @param _amount the amount of tokens to repay
     */
    function repay(address _to, uint _amount) public override whenNotPaused {
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
     * Reverts if collateral received is less than _minCollateral
     * @param _user the account to liquidate
     * @param _maxAmount the maximum amount of debt the liquidator is willing to repay
     * @param _minCollateral the minimum amount of collateral the liquidator is willing to accept
     * @param _to the address that will receive the liquidated collateral
     * @param _swapper an optional implementation of the IFlashSwap interface to exchange the collateral for debt
     */
    function liquidate(
        address _user,
        uint _maxAmount,
        uint _minCollateral,
        address _to,
        IFlashSwap _swapper
    ) external override whenNotPaused {
        require(msg.sender != _user, "Market: cannot liquidate self");

        uint price = _updatePrice(true);

        require(!isUserSolvent(_user), "Market: user solvent");

        uint userCollValue = (userCollateral[_user] * price) / LAST_PRICE_PRECISION;
        uint discountedCollateralValue = (userCollValue * (LIQUIDATION_PENALTY_PRECISION - liquidationPenalty)) /
            LIQUIDATION_PENALTY_PRECISION;
        uint repayAmount = userDebt[_user] < _maxAmount ? userDebt[_user] : _maxAmount;
        uint liquidatedCollateral;

        if (discountedCollateralValue < repayAmount) {
            // collateral is worth less than the proposed repayment amount
            // so buy it all
            liquidatedCollateral = userCollateral[_user];
            repayAmount = discountedCollateralValue;
        } else {
            // collateral is worth more than debt, liquidator purchases "repayAmount"
            liquidatedCollateral = (repayAmount * LAST_PRICE_PRECISION) / discountedCollateralValue;
        }
        require(liquidatedCollateral >= _minCollateral, "excess collateral slippage");

        // bookkeeping
        userCollateral[_user] = userCollateral[_user] - liquidatedCollateral;
        totalCollateral = totalCollateral - liquidatedCollateral;
        userDebt[_user] = userDebt[_user] - repayAmount;
        totalDebt = totalDebt - repayAmount;

        emit Repay(msg.sender, _user, repayAmount);
        emit Withdraw(_user, _to, liquidatedCollateral);
        emit Liquidate(_user, _to, repayAmount, liquidatedCollateral, price);

        collateralToken.safeTransfer(_to, liquidatedCollateral);
        if (_swapper != IFlashSwap(address(0))) {
            _swapper.swap(collateralToken, debtToken, msg.sender, repayAmount, liquidatedCollateral);
        }
        debtToken.safeTransferFrom(msg.sender, address(this), repayAmount);
    }

    /**
     * @notice Harvests fees collected to the treasury
     */
    function harvestFees() external whenNotPaused {
        uint fees = feesCollected;
        feesCollected = 0;
        emit FeesHarvested(fees);

        debtToken.safeTransfer(treasury, fees);
    }

    function checkPriceFrozen() private view {
        require(block.timestamp - lastPriceTime <= ORACLE_MAX_TIMEOUT, "Market: frozen"); // solhint-disable not-rely-on-time
    }

    /**
     * @notice updates the current price of the collateral and saves it in `lastPrice`.
     * @return the price
     */
    function updatePrice() external override returns (uint) {
        return _updatePrice(false);
    }

    function _updatePrice(bool _onFailCheckPriceFrozen) internal returns (uint) {
        (bool success, uint256 price) = oracle.fetchPrice();
        if (success) {
            lastPrice = price;
            lastPriceTime = block.timestamp;
            emit LastPriceUpdated(price);
        } else if (_onFailCheckPriceFrozen) {
            checkPriceFrozen();
        }
        return lastPrice;
    }

    /**
     * @notice reduces the available supply to be borrowed by transferring debt tokens to owner.
     * @param _amount number of tokens to remove
     */
    function reduceSupply(uint _amount) external onlyOwner {
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

    /**
     * @notice Emergency shutdown of the market
     * @param _paused if true, shutdown the market.  if false, resume normal operations.
     */
    function setPaused(bool _paused) external onlyOwner {
        if (_paused) {
            _pause();
        } else {
            _unpause();
        }
    }

    /**
     * @notice recover tokens inadvertantly sent to this contract by transfering them to the owner
     * @param _token the address of the token
     * @param _amount the amount to transfer
     */
    function recoverERC20(address _token, uint256 _amount) external onlyOwner {
        require(_token != address(debtToken), "Cannot recover debt tokens");
        require(_token != address(collateralToken), "Cannot recover collateral tokens");

        IERC20(_token).safeTransfer(msg.sender, _amount);
    }

    //////
    /// View Functions
    //////
    function getUserLTV(address _user) public view override returns (uint) {
        if (userDebt[_user] == 0) return 0;
        if (userCollateral[_user] == 0) return type(uint256).max;
        return
            (userDebt[_user] * LOAN_TO_VALUE_PRECISION) / ((userCollateral[_user] * lastPrice) / LAST_PRICE_PRECISION);
    }

    function isUserSolvent(address _user) public view override returns (bool) {
        return getUserLTV(_user) <= maxLoanToValue;
    }
}
