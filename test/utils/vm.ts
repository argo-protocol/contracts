import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { network, ethers } from "hardhat";

export async function forkNetwork(blockNumber = 13955627) {
    /// Use mainnet fork as provider
    return network.provider.request({
        method: "hardhat_reset",
        params: [
            {
                forking: {
                    jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
                    blockNumber: blockNumber,
                },
            },
        ],
    });
}

export async function forkReset() {
    return await network.provider.request({
        method: "hardhat_reset",
        params: [],
    });
}

export async function impersonate(address: string): Promise<SignerWithAddress> {
     await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [address]
    });
    return await ethers.getSigner(address); 
}

export async function setStorageAt(address: string, position: string, value: string) {
    await network.provider.send("hardhat_setStorageAt", [address, position, value]);
}

export async function getStorageAt(address: string, position: string) {
    return await network.provider.send("eth_getStorageAt", [address, position]);
}