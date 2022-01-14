// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { AggregatorV3Interface } from "../interfaces/AggregatorV3Interface.sol";

contract StubAggregator is AggregatorV3Interface {
    uint8 public override decimals;
    string public  override description;
    uint256 public override version;
    int256 private answer;
    bool public noData = false;

    constructor(
        uint8 _decimals,
        string memory _description,
        uint256 _version,
        int256 _answer
    ) {
        decimals = _decimals;
        description = _description;
        version = _version;
        answer = _answer;
    }

    function setAnswer(int256 _answer) external {
        answer = _answer;
    }

    function toggleNoData() external {
        noData = !noData;
    }

    function getRoundData(uint80 _roundId)
        external
        view
        override
        returns (
        uint80 roundId,
        int256 answer_,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
        ) {
        require(!noData, "No data present");
        roundId = _roundId;
        answer_ = answer;
        // solhint-disable-next-line not-rely-on-time
        startedAt = block.timestamp;
        // solhint-disable-next-line not-rely-on-time
        updatedAt = block.timestamp;
        answeredInRound = 0;
    }

    function latestRoundData()
        external
        view
        override
        returns (
        uint80 roundId,
        int256 answer_,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
        ) {
        require(!noData, "No data present");
        roundId = 0;
        answer_ = answer;
        // solhint-disable-next-line not-rely-on-time
        startedAt = block.timestamp;
        // solhint-disable-next-line not-rely-on-time
        updatedAt = block.timestamp;
        answeredInRound = 0;
    }
}