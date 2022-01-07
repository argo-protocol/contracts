//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { IMarket } from "./interfaces/IMarket.sol";
import { ZeroInterestMarket } from "./ZeroInterestMarket.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import "hardhat/console.sol";

/**
 * Factory for Markets
 **/
contract MarketFactory {
  event CreateMarket(uint256 index);

  IMarket[] public markets;
  ZeroInterestMarket private referenceImpl;

  constructor() {
    referenceImpl = new ZeroInterestMarket();
  }

  function createMarket(
    address _treasury,
    address _collateralToken,
    address _debtToken,
    address _oracle,
    uint256 _maxLoanToValue,
    uint256 _borrowRate,
    uint256 _liquidationPenalty
  ) public {
    ZeroInterestMarket market = ZeroInterestMarket(
      Clones.clone(address(referenceImpl))
    );
    market.initialize(
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
}
