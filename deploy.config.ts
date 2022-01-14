import { string } from "yargs";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface ChainConfig {
    treasuryMultisig: string;
    operatorMultisig: string;
    gOHM: string;
    ohmEthAggregator: string;
    ethUsdAggregator: string;
}

export default  {
    mainnet: {
        treasuryMultisig: ZERO_ADDRESS, // TODO
        operatorMultisig: ZERO_ADDRESS, // TODO
        gOHM: "0x0ab87046fBb341D058F17CBC4c1133F25a20a52f",
        ohmEthAggregator: "0x9a72298ae3886221820B1c878d12D872087D3a23",
        ethUsdAggregator: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    },
    rinkeby: {
        treasuryMultisig: "0xfE07A76856A6FFD96ddF466DEdedab1d76355A6b",
        operatorMultisig: "0xfE07A76856A6FFD96ddF466DEdedab1d76355A6b",
        gOHM: "0xB4Aaf6857411248A79B95bcb1C13E86140fE9C29",
        ohmEthAggregator: ZERO_ADDRESS, // OHM-ETH oracle stubbed
        ethUsdAggregator: "0x8A753747A1Fa494EC906cE90E9f37563A8AF630e",
    },
    hardhat: {
        treasuryMultisig: "0xfE07A76856A6FFD96ddF466DEdedab1d76355A6b",
        operatorMultisig: "0xfE07A76856A6FFD96ddF466DEdedab1d76355A6b",
        // not live environment
        // entire oracle stubbed
        gOHM: ZERO_ADDRESS,
        ohmEthAggregator: ZERO_ADDRESS,
        ethUsdAggregator: ZERO_ADDRESS,
    }
} as { [name: string]: ChainConfig };