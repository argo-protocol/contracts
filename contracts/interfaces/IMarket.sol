//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface IMarket {
    function deposit(address _to, uint256 _amount) external;

    function withdraw(address _to, uint256 _amount) external;

    function borrow(address _to, uint256 _amount) external;

    function repay(address _to, uint256 _amount) external;

    function depositAndBorrow(uint256 _collateralAmount, uint256 _debtAmount) external;

    function repayAndWithdraw(uint256 _debtAmount, uint256 _collateralAmount) external;

    function liquidate(
        address _user,
        uint256 _amount,
        address _to
    ) external;

    function updatePrice() external returns (uint256);

    function getUserLTV(address _user) external view returns (uint256);

    function isUserSolvent(address _user) external view returns (bool);
}
