//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface IMarket {
    function deposit(uint _amount) external;
    function withdraw(uint _amount) external;
    function borrow(uint _amount) external;
    function repay(uint _amount) external;

    function depositAndBorrow(uint _collateralAmount, uint _debtAmount) external;
    function repayAndWithdraw(uint _debtAmount, uint _collateralAmount) external;

    function liquidate(address _user, uint _amount) external;
    function updatePrice() external returns (uint);

    function getUserLTV(address _user) external view returns(uint);
    function isUserSolvent(address _user) external view returns(bool);
}
