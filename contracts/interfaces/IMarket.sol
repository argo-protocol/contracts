//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { IFlashSwap } from "./IFlashSwap.sol";

interface IMarket {
    function deposit(address _to, uint _amount) external;
    function withdraw(address _to, uint _amount) external;
    function borrow(address _to, uint _amount) external;
    function repay(address _to, uint _amount) external;

    function depositAndBorrow(uint _collateralAmount, uint _debtAmount) external;
    function repayAndWithdraw(uint _debtAmount, uint _collateralAmount) external;

    function liquidate(address _user, uint _amount, address _to, IFlashSwap swapper) external;
    function updatePrice() external returns (uint);

    function getUserLTV(address _user) external view returns(uint);
    function isUserSolvent(address _user) external view returns(bool);
}
