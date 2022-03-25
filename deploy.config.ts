import { string } from "yargs";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface ChainConfig {
    treasuryMultisig: string;
    operatorMultisig: string;
    dai: string;
    gOHM: string;
    ohmEthAggregator: string;
    ethUsdAggregator: string;
    psmBuyFee: string;
    psmSellFee: string;
    wxBtrfly: string;
    btrfly: string;
    sushiSwapFactory: string;
    ohmv2: string;
    uniswapOracle: string;
}

let config = {
    mainnet: {
        treasuryMultisig: ZERO_ADDRESS, // TODO
        operatorMultisig: ZERO_ADDRESS, // TODO
        dai: "0x6b175474e89094c44da98b954eedeac495271d0f",
        gOHM: "0x0ab87046fBb341D058F17CBC4c1133F25a20a52f",
        ohmEthAggregator: "0x9a72298ae3886221820B1c878d12D872087D3a23",
        ethUsdAggregator: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
        psmBuyFee: "250",
        psmSellFee: "250",
        wxBtrfly: "0x186E55C0BebD2f69348d94C4A27556d93C5Bd36C",
        btrfly: "0xc0d4ceb216b3ba9c3701b291766fdcba977cec3a",
        sushiSwapFactory: "0xc0aee478e3658e2610c5f7a4a2e1777ce9e4f2ac",
        ohmv2: "0x64aa3364f17a4d01c6f1751fd97c2bd3d7e7f1d5",
        uniswapOracle: ZERO_ADDRESS, // Created in 05_mainnet_wxBTRFLY_oracle.ts
    },
    rinkeby: {
        treasuryMultisig: "0xfE07A76856A6FFD96ddF466DEdedab1d76355A6b",
        operatorMultisig: "0x403898Ddff450b89e2D96BDDcf763541655FDE8B",
        dai: "0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa",
        gOHM: "0xB4Aaf6857411248A79B95bcb1C13E86140fE9C29",
        ohmEthAggregator: ZERO_ADDRESS, // OHM-ETH oracle stubbed
        ethUsdAggregator: "0x8A753747A1Fa494EC906cE90E9f37563A8AF630e",
        psmBuyFee: "250",
        psmSellFee: "250",
        wxBtrfly: "0xB4Aaf6857411248A79B95bcb1C13E86140fE9C29", // Not on rinkeby, just pointing to gohm
        btrfly: "0xB4Aaf6857411248A79B95bcb1C13E86140fE9C29", // Not on rinkeby, just pointing to gohm
        sushiSwapFactory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
        ohmv2: "0x10b27a31AA4d7544F89898ccAf3Faf776F5671C4",
        uniswapOracle: ZERO_ADDRESS, //Created in 05_mainnet_wxBTRFLY_oracle.ts
    },
    hardhat: {
        treasuryMultisig: "0xfE07A76856A6FFD96ddF466DEdedab1d76355A6b",
        operatorMultisig: "0xfE07A76856A6FFD96ddF466DEdedab1d76355A6b",
        // not live environment
        dai: ZERO_ADDRESS,
        // entire oracle stubbed
        gOHM: ZERO_ADDRESS,
        ohmEthAggregator: ZERO_ADDRESS,
        ethUsdAggregator: ZERO_ADDRESS,
        psmBuyFee: "250",
        psmSellFee: "250",
        wxBtrfly: ZERO_ADDRESS,
        btrfly: ZERO_ADDRESS,
        sushiSwapFactory: ZERO_ADDRESS,
        ohmv2: ZERO_ADDRESS,
        uniswapOracle: ZERO_ADDRESS,
    },
} as { [name: string]: ChainConfig };
config.localhost = config.hardhat;

export default config;
