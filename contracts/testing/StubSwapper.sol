// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IFlashSwap } from "../interfaces/IFlashSwap.sol";

interface IFlashSwapV2 is IFlashSwap {

    /**
     * @notice this 
     */
    function reverseSwap() external;
}
