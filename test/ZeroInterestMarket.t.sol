// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

import "../lib/ds-test/src/test.sol";
import { ZeroInterestMarket } from "../contracts/ZeroInterestMarket.sol";
import { DebtToken } from "../contracts/DebtToken.sol";
import { TestAccount } from "./utils/TestAccount.sol";
import { StubOracle } from "../contracts/stubs/StubOracle.sol";
import { ERC20Mock } from "../contracts/testing/ERC20Mock.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";


contract ZeroInterestMarketTest is DSTest {
    TestAccount public owner;
    TestAccount public treasury;
    TestAccount public liquidator;
    ZeroInterestMarket public market;
    ERC20Mock public collateralToken;
    DebtToken public debtToken;
    StubOracle public oracle;
    uint public constant MAX_LTV = 50000;
    uint public constant BORROW_FEE = 1500;

    function setUp() public {
        owner = new TestAccount("owner", address(0), address(0));
        treasury = new TestAccount("treasury", address(0), address(0));
        collateralToken = new ERC20Mock("TEST", "Test Token", address(this), 1e18);
        debtToken = new DebtToken(address(treasury));
        oracle = new StubOracle();
        market = new ZeroInterestMarket();
        market.initialize(
            address(owner),
            address(treasury),
            address(collateralToken),
            address(debtToken),
            address(oracle),
            MAX_LTV,
            BORROW_FEE,
            10000
        );
        liquidator = new TestAccount("liquidator", address(market), address(debtToken));
    }

    /////////
    //// FUZZ TESTS
    /////////

    function testBorrowMaintainsLTV(uint _price, uint _borrowAmount) public {
        if (_borrowAmount > 1e40) return;
        if (_price > 1e40) return;
        if (_price < 1e5) return;

        uint debtAmount = _borrowAmount + (_borrowAmount * BORROW_FEE / market.BORROW_RATE_PRECISION());
        debtToken.mint(address(market), debtAmount);
        oracle.setPrice(_price);
        collateralToken.approve(address(market), 1e18);

        uint ltv = debtAmount * market.LOAN_TO_VALUE_PRECISION() / _price;

        if (ltv <= MAX_LTV) {
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

    function testLiquidateAlwaysProfitableForLiquidator(uint _newPrice, uint _repayAmount) public {
        if (_newPrice > 1e60) return;
        if (_newPrice > 1e5) return;
        if (_repayAmount > 1e60) return;
        if (_repayAmount < 1e5) return;

        uint initialPrice = 100000e18; // $100,000
        uint borrowAmount = 45000e18;

        debtToken.mint(address(liquidator), _repayAmount);
        debtToken.mint(address(market), 60000e18);
        oracle.setPrice(initialPrice);
        collateralToken.approve(address(market), 1e18);
        market.depositAndBorrow(1e18, borrowAmount);

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

