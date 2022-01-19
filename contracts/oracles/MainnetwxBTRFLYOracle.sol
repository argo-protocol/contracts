// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IOracle } from "../interfaces/IOracle.sol";
import { AggregatorV3Interface } from "../interfaces/AggregatorV3Interface.sol";
import { SafeAggregatorV3 } from "../libraries/SafeAggregatorV3.sol";
import { UniswapPairOracle } from "./UniswapPairOracle.sol";
import "hardhat/console.sol";

interface IwxBTRFLY {
    /**
        @notice converts wBTRFLY amount to sBTRFLY
        @dev see https://github.com/redacted-cartel/REDACTED-Smart-Contracts/blob/058416542dbb2a2a532a54328ce2df0f10a34bb0/contracts/WXBTRFLY.sol#L912
        @param _amount uint
        @return uint
     */
    function xBTRFLYValue(uint256 _amount) external view returns (uint256);

    /**
        @notice converts sBTRFLY amount to wBTRFLY
        @dev see https://github.com/redacted-cartel/REDACTED-Smart-Contracts/blob/058416542dbb2a2a532a54328ce2df0f10a34bb0/contracts/WXBTRFLY.sol#L921
        @param _amount uint
        @return uint
     */
    function wBTRFLYValue(uint256 _amount) external view returns (uint256);
}

/**
 * @notice price oracle for wxBTRFLY-USD on the ethereum mainnet
 * @dev see https://github.com/argo-protocol/contracts/issues/19
 */
contract MainnetwxBTRFLYOracle is IOracle {
    using SafeAggregatorV3 for AggregatorV3Interface;

    IwxBTRFLY private wxBTRFLY;
    address private ohm;
    address private btrfly;
    UniswapPairOracle private uniswapPairOracle;
    AggregatorV3Interface private ohmEthFeed;
    AggregatorV3Interface private ethUsdFeed;

    constructor(
        address _wxBTRFLY,
        address _ohm,
        address _btrfly,
        address _uniswapPairOracle, // sushiswap oracle
        address _ohmEthFeed,
        address _ethUsdFeed
    ) {
        require(_wxBTRFLY != address(0), "Oracle: 0x0 wxBTRFLY address");
        require(_ohm != address(0), "Oracle: 0x0 OHM address");
        require(_btrfly != address(0), "Oracle: 0x0 BTRFLY address");
        require(_uniswapPairOracle != address(0), "Oracle: 0x0 _uniswapPairOracle address");
        require(_ohmEthFeed != address(0), "Oracle: 0x0 OHM-ETH address");
        require(_ethUsdFeed != address(0), "Oracle: 0x0 ETH-USD address");

        wxBTRFLY = IwxBTRFLY(_wxBTRFLY);
        ohm = _ohm;
        btrfly = _btrfly;
        ohmEthFeed = AggregatorV3Interface(_ohmEthFeed);
        ethUsdFeed = AggregatorV3Interface(_ethUsdFeed);
        uniswapPairOracle = UniswapPairOracle(_uniswapPairOracle);
    }

    function update() external {
        if (uniswapPairOracle.canUpdate()) {
            uniswapPairOracle.update();
        }
    }

    /**
     * @notice fetches the latest price
     * @dev wxBTRFLY/USD = IwxBTRFLY::wBTRFLYValue(BTRFLY/OHM * OHM/ETH * ETH/USD)
     * @return the price with 18 decimals
     */
    function fetchPrice() external view override returns (bool, uint256) {
        (bool ethUsdSuccess, uint256 ethUsdPrice) = ethUsdFeed.safeLatestRoundData();
        (bool ohmEthSuccess, uint256 ohmEthPrice) = ohmEthFeed.safeLatestRoundData();

//on jan 6 at 1800 PST (time of the block at 13955627)
//ohmv1 = 380, ohmv2=300 
//btrfly = 3180
//eth = 3392
//of 1 ohm = 0.094339622641509 btrfly
        // uint256 x = uniswapPairOracle.consult(btrfly, 1e9);
        // console.log("consult btrfly:", x);

        uint256 btrflyOhmPrice = uniswapPairOracle.consult(btrfly, 1e9);
        console.log("consult btrflyOhmPrice:", btrflyOhmPrice); //10

        if (!ethUsdSuccess || !ohmEthSuccess) {
            return (false, 0);
        }

        console.log("ohmEthPrice:", ohmEthPrice);
        console.log("ethUsdPrice:", ethUsdPrice);
        uint ohmUsdPrice = ohmEthPrice * ethUsdPrice / 1e36; //386
        console.log("ohmUsdPrice:", ohmUsdPrice);

    uint btrflyUsdPrice = btrflyOhmPrice * ohmEthPrice * ethUsdPrice / 1e45; //1e9 for btrflyOhm, 1e18 for ohmEthPrice, 1e18 for ethUsdPrice

    console.log("btrflyUsdPrice:", btrflyUsdPrice);
        return (true, wxBTRFLY.wBTRFLYValue(btrflyUsdPrice));
    }
}
