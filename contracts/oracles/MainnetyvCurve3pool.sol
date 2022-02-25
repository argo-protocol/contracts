// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IOracle } from "../interfaces/IOracle.sol";
import { AggregatorV3Interface } from "../interfaces/AggregatorV3Interface.sol";
import { SafeAggregatorV3 } from "../libraries/SafeAggregatorV3.sol";

interface IYearnVault {
    function pricePerShare() external view returns (uint256 price);
    }

interface ICurvePool {
    function get_virtual_price() external view returns (uint256 price);
}

/**
 * @notice price oracle for yvCurve-3pool (see https://yearn.finance/#/vault/0x84E13785B5a27879921D6F685f041421C7F482dA ) on the ethereum mainnet
 * @dev Confirmed calculation in conversation at https://discord.com/channels/734804446353031319/734811808401063966/946820648192344065 and logic within 3crv oracle from https://github.com/Abracadabra-money/magic-internet-money/blob/20314c3a799c82756280ca5ee76fe903ffb122c5/contracts/oracles/3CrvOracle.sol
 */
contract MainnetyvCurve3pool is IOracle {
    using SafeAggregatorV3 for AggregatorV3Interface;

    IYearnVault private yvcurve3pool;
    ICurvePool private threeCrv;
    AggregatorV3Interface private dai;
    AggregatorV3Interface private usdc;
    AggregatorV3Interface private usdt;

    constructor(
        address _yvcurve3pool,
        address _threecrv,
        address _dai,
        address _usdc,
        address _usdt
    ) {
        require(_yvcurve3pool != address(0), "Oracle: 0x0 yvcurve3pool address");
        require(_threecrv != address(0), "Oracle: 0x0 3crv address");
        require(_dai != address(0), "Oracle: 0x0 dai address");
        require(_usdc != address(0), "Oracle: 0x0 usdc address");
        require(_usdt != address(0), "Oracle: 0x0 usdt address");

        yvcurve3pool = IYearnVault(_yvcurve3pool);
        threeCrv = ICurvePool(_threecrv);
        dai = AggregatorV3Interface(_dai);
        usdc = AggregatorV3Interface(_usdc);
        usdt = AggregatorV3Interface(_usdt);
    }

    /**
     * @notice fetches the latest price
     * @return the price with 18 decimals
     */
    function fetchPrice() external view override returns (bool, uint256) {

        // 1.  Fetch min stablecoin price between dai/usdc/usdt
        bool success;
        uint256 minStable;
        uint256 curStablePrice;
        (success, minStable) = dai.safeLatestRoundData();
        if (!success) {
            return (false, 0);
        }

        (success, curStablePrice) = usdc.safeLatestRoundData();
        if (!success) {
            return (false, 0);
        }
        if (curStablePrice < minStable) {
            minStable = curStablePrice;
        }

        (success, curStablePrice) = usdt.safeLatestRoundData();
        if (!success) {
            return (false, 0);
        }
        if (curStablePrice < minStable) {
            minStable = curStablePrice;
        }

        // 2.  Calc the price - yearn price per share * three curv price per share * stablecoin price

        // From curve docs at: https://curve.readthedocs.io/factory-pools.html?highlight=get_virtual_price#StableSwap.get_virtual_price
        // The current price of the pool LP token relative to the underlying pool assets. Given as an integer with 1e18 precision.

        // Precision info: pricePerShare() is 18 decimals, get_virtual_price is 18 decimals, minStable is 18 decimals, and we want to return 18 decimals.  So divide by 18*2=36 decimals        
        uint256 result = (yvcurve3pool.pricePerShare() * threeCrv.get_virtual_price() * minStable) / 1e36;
        return (true, result);
    }
}
