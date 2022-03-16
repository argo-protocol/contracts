//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IDebtToken } from "./interfaces/IDebtToken.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

interface ICurveStableSwapPool is IERC20Metadata {
    function add_liquidity(uint256[2] memory _amounts, uint256 _min_mint_amount) external returns (uint256);
    function remove_liquidity(uint256 _amount, uint256[2] memory _min_amounts) external returns (uint256[2] memory);
    function calc_token_amount(uint256[2] memory _amounts, bool _is_deposit) external view returns (uint256);
    function balances(uint256 _i) external view returns(uint256);
}

interface ICurveFactory {
    function find_pool_for_coins(address _from, address _to) external view returns(address);
    function deploy_metapool(address _base_pool, string memory _name, string memory _symbol, address _coin, uint256 _A, uint256 _fee) external returns (address);
}

contract LiquidityBootstrap is Ownable {
    using SafeERC20 for IDebtToken;
    using SafeERC20 for IERC20Metadata;
    using SafeERC20 for ICurveStableSwapPool;

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

        IDebtToken(_debtToken).approve(_pool, type(uint256).max);
        IERC20Metadata(_pairToken).approve(_pool, type(uint256).max);
    }

    /**
     * @notice transfers _amount of pair tokens, pairs them with an equivalent
     * amount of ARGO and deposits them into curve.
     * @dev see previewAdd to get an estimate of what min shares should be
     * @param _amount the amount of 3CRV to deposit
     * @param _minShares the minimum amount of shares to create
     */
    function addLiquidity(uint256 _amount, uint256 _minShares) public {
        uint256[2] memory amounts;
        amounts[0] = _amount;
        amounts[1] = _amount;

        pairToken.safeTransferFrom(msg.sender, address(this), _amount);
        uint shares = pool.add_liquidity(amounts, _minShares);

        userShares[msg.sender] += shares;
        totalShares += shares;
    }

    /**
     * @notice redeems LP shares by transfering the LP token to the user
     * @dev will transfer boost portion to operator
     * @param _shares the number of LP token shares to redeem
     */
    function redeemLPShares(uint256 _shares) public {
        uint256 maxShares = _redeemableShares(msg.sender);
        require(_shares <= maxShares, "insufficient shares");

        userShares[msg.sender] -= _shares;
        totalShares -= _shares;

        pool.safeTransfer(msg.sender, _shares);
        pool.safeTransfer(operator, _shares);
    }

    /**
     * @notice removes _shares of debt token from curve pool
     */
    function removeLiquidity(uint _shares, uint256[2] memory _minAmounts) public {
        uint256 boostedShares = _shares << 1; // gas efficient 2x
        uint256 userBoostedShares = userShares[msg.sender];
        require(boostedShares <= userBoostedShares, "insufficient shares");

        userShares[msg.sender] -= boostedShares;
        totalShares -= boostedShares;

        uint[2] memory removed = pool.remove_liquidity(_shares, _minAmounts);
        debtToken.safeTransfer(msg.sender, removed[0]);
        pairToken.safeTransfer(msg.sender, removed[1]);
        pool.safeTransfer(operator, _shares);
    }

    function setOperator(address _operator) external onlyOwner {
        require(_operator != address(0), "0x0");
        operator = _operator;
    }

    /**
     * @notice the number of shares a user can redeem
     * Does not include their boosted shares
     * @return amount of LP token shares
     */
    function redeemableShares(address _user) external view returns (uint256) {
        return _redeemableShares(_user);
    }

    function _redeemableShares(address _user) internal view returns (uint256) {
        return userShares[_user] >> 1; // bit-shift right == divide by 2
    }

    /**
     * @notice previews the amount of debt and pair tokens you'd recieve from removing
     * _shares of liquidity. Does NOT include slippage.
     * @param _shares amount of LP token shares
     */
    function previewRemove(uint256 _shares) public view returns (uint256[2] memory) {
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
     */
    function previewAdd(uint _amount) public view returns (uint256) {
        uint256[2] memory amounts;
        amounts[0] = _amount;
        amounts[1] = _amount;

        return pool.calc_token_amount(amounts, true); // true == is a deposit
    }
}