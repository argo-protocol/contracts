import * as dotenv from "dotenv";

import { task } from "hardhat/config";
import { HardhatUserConfig } from "hardhat/config";
import { NetworkUserConfig } from "hardhat/types";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "hardhat-deploy";
import { BigNumber } from "ethers";
import deployConfig from "./deploy.config";

task("deployments", "Print the list of deployment addresses for the current network", async (args, hre) => {
    const allDeployments = await hre.deployments.all();
    const deployments = Object.keys(allDeployments)
        .sort()
        .map((name) => ({
            name: name,
            address: allDeployments[name].address,
        }));
    console.table(deployments);
});

task("markets", "Print the markets created by the currently deployed MarketFactory", async (args, hre) => {
    const deployment = await hre.deployments.get("MarketFactory");
    const marketFactory = await hre.ethers.getContractAt("MarketFactory", deployment.address);

    const numMarkets = await marketFactory.numMarkets();
    for (let i = BigNumber.from(0); i.lt(numMarkets); i = i.add(1)) {
        const marketAddr = await marketFactory.markets(i);
        const market = (await hre.ethers.getContractFactory("ZeroInterestMarket")).attach(marketAddr);
        console.log("");
        console.log(`${marketAddr} - ${i.toString()}`);
        console.log(`  lastPrice:          ${await market.lastPrice()}`);
        console.log(`  feesCollected:      ${await market.feesCollected()}`);
        console.log(`  maxLoanToValue:     ${await market.maxLoanToValue()}`);
        console.log(`  borrowRate:         ${await market.borrowRate()}`);
        console.log(`  liquidationPenalty: ${await market.liquidationPenalty()}`);
        console.log(`  totalCollateral:    ${await market.totalCollateral()}`);
        console.log(`  totalDebt:          ${await market.totalDebt()}`);
    }
});

dotenv.config();

const privateKey: string | undefined = process.env.PRIVATE_KEY ?? "NO_PRIVATE_KEY";
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
        accounts: privateKey !== "NO_PRIVATE_KEY" ? [`${privateKey}`] : [],
        chainId: chainIds[network],
        url,
        gasPrice: 50000000000
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
        operatorMultisig: {
            default: 1,
            rinkeby: deployConfig.rinkeby.operatorMultisig,
            mainnet: deployConfig.mainnet.operatorMultisig,
        },
        treasuryMultisig: {
            default: 2,
            rinkeby: deployConfig.rinkeby.treasuryMultisig,
            mainnet: deployConfig.mainnet.treasuryMultisig,
        },
        stubUser1: {
            default: 3,
        },
        stubUser2: {
            default: 4,
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
