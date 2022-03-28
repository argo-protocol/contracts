// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IFlashSwap {
    /**
     * @notice A callback for liquidations. The swap method will be called after the collateral tokens
     * have been transfered to the recipient. This function is then responsible for acquiring at least
     * _amountToMin of the debt tokens to pay for the liquidation. The debt tokens will then be transferFrom
     * the recipeient to the market contract, so it is required to approve the market contract for `_amountToMin`.
     * @param _collateralToken the collateral token
     * @param _debtToken the debt token
     * @param _recipient the address who should recieve the swapped debt tokens
     * @param _minRepayAmount the minimum amount of debt tokens needed for the transaction to be successful
     * @param _collateralAmount the number of collateral tokens that have just been transferred to recipient
     */
    function swap(
        IERC20 _collateralToken,
        IERC20 _debtToken,
        address _recipient,
        uint256 _minRepayAmount,
        uint256 _collateralAmount
    ) external;
}
