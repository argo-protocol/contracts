// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.6;

import "../lib/ds-test/src/test.sol";
import { ZeroInterestMarket } from "../contracts/ZeroInterestMarket.sol";
import { DebtToken } from "../contracts/DebtToken.sol";
import { TestAccount } from "./utils/TestAccount.sol";
import { TestOracle } from "./utils/TestOracle.sol";
import { ERC20Mock } from "./utils/ERC20Mock.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";


contract ZeroInterestMarketTest is DSTest {
    TestAccount treasury;
    TestAccount liquidator;
    ZeroInterestMarket market;
    ERC20Mock collateralToken;
    DebtToken debtToken;
    TestOracle oracle;

    function init(uint _maxLoanToValue, uint _borrowRate, uint _liquidationPenalty) public {
        treasury = new TestAccount("treasury", address(0), address(0));
        collateralToken = new ERC20Mock("TEST", "Test Token", address(this), 1e18);
        debtToken = new DebtToken();
        oracle = new TestOracle();
        market = new ZeroInterestMarket(
            address(treasury),
            address(collateralToken),
            address(debtToken),
            address(oracle),
            _maxLoanToValue,
            _borrowRate,
            _liquidationPenalty
        );
        liquidator = new TestAccount("liquidator", address(market), address(debtToken));
    }

    /////////
    //// FUZZ TESTS
    /////////

    function testBorrowMaintainsLTV(uint _maxLoanToValue, uint _borrowRate, uint _liquidationPenalty, uint _price, uint _borrowAmount) public {       
        if (_maxLoanToValue > 1e10) return;
        if (_borrowRate > 1e10) return;
        if (_liquidationPenalty > 1e10) return;
        if (_borrowAmount > 1e40) return;
        if (_price > 1e40) return;
        if (_price < 1e5) return;
        init(_maxLoanToValue, _borrowRate, _liquidationPenalty);

        uint debtAmount = _borrowAmount + (_borrowAmount * market.borrowRate() / market.BORROW_RATE_PRECISION());
        debtToken.mint(address(market), debtAmount);
        oracle.setPrice(_price);
        collateralToken.approve(address(market), 1e18);

        uint ltv = debtAmount * market.LOAN_TO_VALUE_PRECISION() / _price;

        if (ltv <= market.maxLoanToValue()) {
            market.depositAndBorrow(1e18, _borrowAmount);
            assertEq(debtToken.balanceOf(address(this)), _borrowAmount);
        } else {
            emit log("this should throw");
            try market.depositAndBorrow(1e18, _borrowAmount) {
                assertTrue(false);
            } catch Error(string memory reason) {
                emit log(reason);
                assertEq(reason, "Market: exceeds Loan-to-Value");
            }
        }
    }

    function testLiquidateAlwaysProfitableForLiquidator(uint _maxLoanToValue, uint _borrowRate, uint _liquidationPenalty, uint _newPrice, uint _repayAmount) public {        
        if (_maxLoanToValue > 1e10) return;
        if (_borrowRate > 1e10) return;
        if (_liquidationPenalty > 1e10) return;        
        if (_newPrice > 1e60) return;
        if (_newPrice < 1e5) return;
        if (_repayAmount > 1e60) return;
        if (_repayAmount < 1e5) return;

        init(_maxLoanToValue, _borrowRate, _liquidationPenalty);

        uint initialPrice = 100000e18; // $100,000
        uint borrowAmount = 45000e18;
        uint depositAmount = 1e2 + ((borrowAmount * market.LOAN_TO_VALUE_PRECISION() * market.LAST_PRICE_PRECISION()) / (initialPrice * _maxLoanToValue));        

        debtToken.mint(address(liquidator), _repayAmount);
        debtToken.mint(address(market), 60000e18);
        oracle.setPrice(initialPrice);
        collateralToken.approve(address(market), 1e18);
        market.depositAndBorrow(depositAmount, borrowAmount);

        oracle.setPrice(_newPrice);

        if (_newPrice < 90000e18) {
            // this will cause a liquidation
            liquidator.liquidate(address(this), _repayAmount);
            uint valueOfLiqAssets = collateralToken.balanceOf(address(liquidator)) * _newPrice / market.LAST_PRICE_PRECISION();
            uint amountPaid = _repayAmount - debtToken.balanceOf(address(liquidator));
            assertGt(valueOfLiqAssets, amountPaid);
        } else {
            // revert for not liquidating
            try liquidator.liquidate(address(this), _repayAmount) {
                assert(false);
            } catch Error(string memory reason) {
                assertEq(reason, "Market: user solvent");
            }
        }
    }
}

