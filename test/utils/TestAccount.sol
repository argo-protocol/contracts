//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { IMarket } from "../../contracts/interfaces/IMarket.sol";
import { IFlashSwap } from "../../contracts/interfaces/IFlashSwap.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TestAccount {
    string public name;
    IMarket public market;
    IERC20 public debtToken;

    constructor(string memory _name, address _market, address _debtToken) {
        name = _name;
        market = IMarket(_market);
        debtToken = IERC20(_debtToken);
    }

    function liquidate(address _user, uint _amount) external {
        debtToken.approve(address(market), _amount);
        market.liquidate(_user, _amount, address(this), IFlashSwap(address(0)));
    }
}