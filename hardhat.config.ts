import * as dotenv from "dotenv";

import { HardhatUserConfig } from "hardhat/config";
import { NetworkUserConfig } from "hardhat/types";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "hardhat-deploy";

dotenv.config();

const privateKey: string | undefined = process.env.PRIVATE_KEY ??  "0x0000000000000000000000000000000000000000";
const alchemyApiKey: string | undefined = process.env.ALCHEMY_API_KEY ?? "NO_ALCHEMY_API_KEY";

const chainIds = {
    goerli: 5,
    hardhat: 31337,
    kovan: 42,
    mainnet: 1,
    rinkeby: 4,
    ropsten: 3,
};

function getChainConfig(network: keyof typeof chainIds): NetworkUserConfig {
    const url = `https://eth-${network}.alchemyapi.io/v2/${alchemyApiKey}`;
    return {
        accounts: [`${privateKey}`],
        chainId: chainIds[network],
        url,
    };
}

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.6",
        settings: {
            optimizer: {
                enabled: true,
                runs: 1,
            },
        },
    },
    namedAccounts: {
        deployer: {
            default: 0,
        },
        owner: {
            default: 1,
        },
    },

    networks: {
        mainnet: getChainConfig("mainnet"),
        ropsten: getChainConfig("ropsten"),
        rinkeby: getChainConfig("rinkeby"),
        hardhat: {
            live: false,
            saveDeployments: true,
            chainId: 1337,
        },
        localhost: {
            live: false,
            saveDeployments: true,
            chainId: 1337,
        },
    },
    gasReporter: {
        enabled: process.env.REPORT_GAS !== undefined,
        currency: "USD",
        coinmarketcap: process.env.COINMARKETCAP_API_KEY || undefined,
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY,
    },
};

export default config;
