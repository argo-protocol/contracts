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
    event Deposit(address indexed from, uint256 amount);
    event Withdraw(address indexed from, uint256 amount);
    event Borrow(address indexed from, uint256 amount);
    event Repay(address indexed from, uint256 amount);
    event Liquidate(address indexed from, uint256 repayDebt, uint256 liquidatedCollateral);

    uint constant internal MAX_INT = 2**256 - 1;

    address public treasury;
    IERC20 public collateralToken;
    IERC20 public debtToken;

    IOracle public oracle;
    uint public lastPrice;
    uint constant public LAST_PRICE_PRECISION = 1e18;

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

    function deposit(uint _amount) public override {
        userCollateral[msg.sender] = userCollateral[msg.sender] + _amount;
        totalCollateral = totalCollateral + _amount;

        collateralToken.safeTransferFrom(msg.sender, address(this), _amount);

         emit Deposit(msg.sender, _amount);
    }

    function withdraw(uint _amount) public override {
        require(_amount <= userCollateral[msg.sender], "Market: withdrawal exceeds collateral balance");
        _updatePrice();

        userCollateral[msg.sender] = userCollateral[msg.sender] - _amount;
        totalCollateral = totalCollateral - _amount;

        require(isUserSolvent(msg.sender), "Market: exceeds Loan-to-Value");

        collateralToken.safeTransfer(msg.sender, _amount);

        emit Withdraw(msg.sender, _amount);
    }

    function borrow(uint _amount) public override {
        _updatePrice();

        uint borrowRateFee = _amount * borrowRate / BORROW_RATE_PRECISION;
        totalDebt = totalDebt + _amount + borrowRateFee;
        userDebt[msg.sender] = userDebt[msg.sender] + _amount + borrowRateFee;

        require(isUserSolvent(msg.sender), "Market: exceeds Loan-to-Value");

        debtToken.safeTransfer(treasury, borrowRateFee);
        debtToken.safeTransfer(msg.sender, _amount);

        emit Borrow(msg.sender, _amount);
    }

    function repay(uint _amount) public override {
        require(_amount <= userDebt[msg.sender], "Market: repay exceeds debt");
        totalDebt = totalDebt - _amount;
        userDebt[msg.sender] = userDebt[msg.sender] - _amount;

        debtToken.safeTransferFrom(msg.sender, address(this), _amount);

         emit Repay(msg.sender, _amount);
    }

    function depositAndBorrow(uint _depositAmount, uint _borrowAmount) external override {
        deposit(_depositAmount);
        borrow(_borrowAmount);
    }

    function repayAndWithdraw(uint _repayAmount, uint _withdrawAmount) external override {
        repay(_repayAmount);
        withdraw(_withdrawAmount);
    }

    function liquidate(address _user, uint _maxAmount) external override {
        uint price = _updatePrice();

        require(!isUserSolvent(_user), "Market: user solvent");

        uint userCollValue = userCollateral[_user] * price /  LAST_PRICE_PRECISION;
        uint userDebtAmount = userDebt[_user];
        uint repayAmount;
        if (userCollValue < userDebtAmount) {
            // there isn't enough collateral to repay all the debt
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
        collateralToken.safeTransfer(msg.sender, liquidatedCollateral);

        emit Liquidate(msg.sender, repayAmount, liquidatedCollateral);
    }

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