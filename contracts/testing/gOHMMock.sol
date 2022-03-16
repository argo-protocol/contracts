// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;


import { IgOHM } from "../interfaces/IgOHM.sol";
import { ERC20Mock } from "./ERC20Mock.sol";

contract gOHMMock is ERC20Mock, IgOHM {
    uint public index_;

    constructor(
        address initialAccount,
        uint256 initialBalance
    ) ERC20Mock("Mock gOHM", "gOHM", initialAccount, initialBalance) {
        index_ = 1e9;
    }

    /**
     * @notice converts gOHM amount to OHM
     * @param _amount uint
     * @return uint
     */
    function balanceFrom(uint256 _amount) public view override returns (uint256) {
        return (_amount * index_) / (10**decimals());
    }

    /**
      * @notice converts OHM amount to gOHM
      * @param _amount uint
      * @return uint
     */
    function balanceTo(uint256 _amount) public view override returns (uint256) {
        return (_amount * 10**decimals()) / index_;
    }

    function index() external override view returns (uint) {
        return index_;
    }

    function setIndex(uint _index) external {
        index_ = _index;
    }
}