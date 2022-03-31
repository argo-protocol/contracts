// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IFlashSwap } from "../interfaces/IFlashSwap.sol";
import { IOracle } from "../interfaces/IOracle.sol";
import { IMarket } from "../interfaces/IMarket.sol";
import { IPSM } from "../interfaces/IPSM.sol";
import "hardhat/console.sol";

interface IOlympusStaking {
    function unstake(
        address _to,
        uint256 _amount,
        bool _trigger,
        bool _rebasing
    ) external returns (uint256 amount_);
}

interface IUniswapRouter02 {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
}

contract MainnetgOhmLiquidatorV1 is IFlashSwap {
    IMarket public market;
    IOlympusStaking public staking;
    IOracle public oracle;
    IUniswapRouter02 public sushiRouter;
    IPSM public psm;
    address public ohm;
    address public dai;

    uint256 private tmpDesiredProfit;
    address private tmpRecipient;

    constructor(
        address _market,
        address _staking,
        address _oracle,
        address _sushiRouter,
        address _ohm,
        address _dai,
        address _psm
    ) {
        market = IMarket(_market);
        staking = IOlympusStaking(_staking);
        oracle = IOracle(_oracle);
        sushiRouter = IUniswapRouter02(_sushiRouter);
        ohm = _ohm;
        dai = _dai;
        psm = IPSM(_psm);
    }

    function liquidate(
        address _user,
        uint256 _maxAmount,
        uint256 _desiredProfit,
        address _to
    ) public {
        tmpDesiredProfit = _desiredProfit;
        tmpRecipient = _to;
        market.liquidate(_user, _maxAmount, 0, address(this), this);
        tmpDesiredProfit = 0;
        tmpRecipient = address(0);
    }

    function swap(
        IERC20 _collateralToken,
        IERC20 _debtToken,
        address _recipient,
        uint256 _minRepayAmount,
        uint256 _collateralAmount
    ) external override {
        require(_recipient == address(this), "must be self");
        // unstake gOHM -> OHM
        _collateralToken.approve(address(staking), _collateralAmount);
        uint256 ohmAmount = staking.unstake(
            address(this),
            _collateralAmount,
            false, // don't trigger a rebase
            false // gOHM not sOHM
        );

        // swap OHM -> DAI
        IERC20(ohm).approve(address(sushiRouter), IERC20(ohm).balanceOf(address(this)));
        address[] memory path = new address[](2);
        path[0] = ohm;
        path[1] = dai;
        uint[] memory amounts = sushiRouter.swapExactTokensForTokens(
            ohmAmount,
            _minRepayAmount + tmpDesiredProfit,
            path,
            address(this),
            // solhint-disable-next-line not-rely-on-time
            block.timestamp
        );

        // use PSM for DAI -> oUSD
        IERC20(dai).approve(address(psm), amounts[1]);
        uint256 oUsdToBuy = (amounts[1] * (psm.FEE_PRECISION() - psm.buyFee())) / psm.FEE_PRECISION();
        psm.buy(oUsdToBuy);

        // approve oUSD _minRepayAmount to liquidate
        _debtToken.approve(address(market), _minRepayAmount);

        // transfer the profit to _recipient
        uint256 balance = _debtToken.balanceOf(address(this));
        require(balance - _minRepayAmount >= tmpDesiredProfit, "unprofitable");
        _debtToken.transfer(tmpRecipient, balance - _minRepayAmount);
    }
}
