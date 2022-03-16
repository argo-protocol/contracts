//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IDebtToken } from "./interfaces/IDebtToken.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { ICurveStableSwapPool } from "./interfaces/Curve.sol";

contract LiquidityBootstrap is Ownable, ReentrancyGuard {
    using SafeERC20 for IDebtToken;
    using SafeERC20 for IERC20Metadata;
    using SafeERC20 for ICurveStableSwapPool;

    event CreatedLP(address indexed user, uint256 shares);
    event RedeemLP(address indexed user, uint256 shares);
    event WithdrawLP(address indexed user, uint256 shares);
    event OperatorUpdated(address operator);

    /// this is ARGO
    IDebtToken public immutable debtToken;
    /// this is 3CRV
    IERC20Metadata public immutable pairToken;
    /// the ARGO/3CRV lp token
    ICurveStableSwapPool public immutable pool;

    /// amount of total LP tokens held by contract
    uint256 public totalShares;
    /// amount boosted of LP tokens allocated to each user
    ///  for redeemable shares
    mapping (address => uint256) public userShares;

    /// the address that will operate the protocol owned liquidity
    /// when a user redeems their LP shares, the boost portion will
    /// be sent here
    address public operator;

    constructor (
        address _debtToken,
        address _pairToken,
        address _pool,
        address _operator
    ) {
        debtToken = IDebtToken(_debtToken);
        pairToken = IERC20Metadata(_pairToken);
        pool = ICurveStableSwapPool(_pool);
        operator = _operator;

        emit OperatorUpdated(_operator);

        IDebtToken(_debtToken).approve(_pool, type(uint256).max);
        IERC20Metadata(_pairToken).approve(_pool, type(uint256).max);
    }

    /**
     * @notice transfers _amount of pair tokens, pairs them with an equivalent
     * amount of ARGO and deposits them into curve.
     * @dev see previewAdd to get an estimate of what min shares should be
     * @param _amount the amount of 3CRV to deposit
     * @param _minShares the minimum amount of boosted shares to create
     * @return boosted shares actually created
     */
    function createLPShares(uint256 _amount, uint256 _minShares) public nonReentrant returns (uint256) {
        uint256[2] memory amounts;
        amounts[0] = _amount;
        amounts[1] = _amount;

        pairToken.safeTransferFrom(msg.sender, address(this), _amount);
        uint shares = pool.add_liquidity(amounts, _minShares);
        emit CreatedLP(msg.sender, shares);

        userShares[msg.sender] += shares;
        totalShares += shares;
        return shares;
    }

    /**
     * @notice redeems LP shares by transfering the LP token to the user
     * @dev will transfer boost portion to operator
     * @param _shares the number of LP token shares to redeem
     */
    function withdrawLPShares(uint256 _shares) public {
        uint256 boostedShares = _shares << 1; // gas efficient 2x
        uint256 userBoostedShares = userShares[msg.sender];
        require(boostedShares <= userBoostedShares, "insufficient shares");

        userShares[msg.sender] -= boostedShares;
        totalShares -= boostedShares;
        emit WithdrawLP(msg.sender, _shares);

        pool.safeTransfer(msg.sender, _shares);
        pool.safeTransfer(operator, _shares);
    }

    /**
     * @notice redeems _shares for their underlying tokens
     * will transfer tokens to msg.sender
     * @param _shares the number of shares to redeem
     * @param _minAmounts the min amounts of tokens to withdraw including slippage 0-ARGO, 1-3CRV
     * @return the actual amount of tokens redeemed
     */
    function redeemLPShares(uint256 _shares, uint256[2] memory _minAmounts) public returns (uint256[2] memory){
        uint256 boostedShares = _shares << 1; // gas efficient 2x
        uint256 userBoostedShares = userShares[msg.sender];
        require(boostedShares <= userBoostedShares, "insufficient shares");

        userShares[msg.sender] -= boostedShares;
        totalShares -= boostedShares;
        emit RedeemLP(msg.sender, _shares);

        uint256[2] memory redeemed = pool.remove_liquidity(_shares, _minAmounts);
        debtToken.safeTransfer(msg.sender, redeemed[0]);
        pairToken.safeTransfer(msg.sender, redeemed[1]);
        pool.safeTransfer(operator, _shares);
        return redeemed;
    }

    /**
     * @notice sets the address to send boosted LP shares after redemption
     * @dev can only be done by owner
     * @param _operator the address
     */
    function setOperator(address _operator) external onlyOwner {
        require(_operator != address(0), "0x0");
        operator = _operator;
        emit OperatorUpdated(_operator);
    }

    /**
     * @notice the number of shares a user can redeem
     * Does not include their boosted shares
     * @return amount of LP token shares
     */
    function ownedShares(address _user) external view returns (uint256) {
        return userShares[_user] >> 1; // bit-shift right == divide by 2
    }

    /**
     * @notice previews the amount of debt and pair tokens you'd recieve from removing
     * _shares of liquidity. Does NOT include slippage.
     * @param _shares amount of LP token shares
     * @return array of token amounts 0-argo, 1-3crv
     */
    function previewRemove(uint256 _shares) external view returns (uint256[2] memory) {
        uint256 supply = pool.totalSupply();
        uint256[2] memory expected;
        expected[0] = pool.balances(0) * _shares / supply;
        expected[1] = pool.balances(1) * _shares / supply;
        return expected;
    }

    /**
     * @notice previews the amount of LP shares that would be created once
     * pairTokens are matched up with an equivalent amount of Argo.
     * Does NOT include slippage.
     * @param _amount amount of pairTokens
     * @return the expected number of shares
     */
    function previewAdd(uint _amount) external view returns (uint256) {
        uint256[2] memory amounts;
        amounts[0] = _amount;
        amounts[1] = _amount;

        return pool.calc_token_amount(amounts, true); // true == is a deposit
    }
}