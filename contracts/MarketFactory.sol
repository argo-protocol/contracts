//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IMarket } from "./interfaces/IMarket.sol";
import { ZeroInterestMarket } from "./ZeroInterestMarket.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * Factory for Markets
 **/
contract MarketFactory is Ownable {
    /**
     * @notice New market created
     * @param index Index of the current market in `markets` list.
     */
    event CreateMarket(uint256 index);

    IMarket[] public markets;
    ZeroInterestMarket private zeroInterestMarketImpl;

    /**
     * @notice Create new MarketFactory with an owner
     * @param _owner Owner of the factory and all markets
     */
    constructor(address _owner) {
        zeroInterestMarketImpl = new ZeroInterestMarket();
        transferOwnership(_owner);
    }

    /**
     * @notice Create new ZeroInterestMarket owned by this contract's owner
     * @param _treasury the account that receives fees
     * @param _collateralToken ERC-20 to be deposited as collateral
     * @param _debtToken ERC-20 to be withdrawn as debt
     * @param _oracle Oracle from which to fetch updated collateral/debt token price
     * @param _maxLoanToValue Maximum ratio of debt to collateral
     * @param _borrowRate Rate to calculate flat borrow fee
     * @param _liquidationPenalty Rate to calculate liquidation penalty
     */
    function createZeroInterestMarket(
        address _treasury,
        address _collateralToken,
        address _debtToken,
        address _oracle,
        uint256 _maxLoanToValue,
        uint256 _borrowRate,
        uint256 _liquidationPenalty
    ) public onlyOwner {
        ZeroInterestMarket market = ZeroInterestMarket(Clones.clone(address(zeroInterestMarketImpl)));
        market.initialize(
            owner(),
            _treasury,
            _collateralToken,
            _debtToken,
            _oracle,
            _maxLoanToValue,
            _borrowRate,
            _liquidationPenalty
        );
        markets.push(market);

        emit CreateMarket(markets.length - 1);
    }

    function numMarkets() public view returns (uint256) {
        return markets.length;
    }
}