//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface IOracle {
    function fetchPrice() external returns (uint);
}