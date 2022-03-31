type Config = {
    [name: string]: {
        chainId: number;
        endpoint: string;
    };
};

export const testnets: Config = {
    rinkeby: {
        chainId: 10001,
        endpoint: "0x79a63d6d8bbd5c6dfc774da79bccd948eacb53fa",
    },
    binance: {
        chainId: 10009,
        endpoint: "0x6fcb97553d41516cb228ac03fdc8b9a0a9df04a1",
    },
    avalanche: {
        chainId: 10006,
        endpoint: "0x93f54d755a063ce7bb9e6ac47eccc8e33411d706",
    },
    polygon: {
        chainId: 10009,
        endpoint: "0xf69186dfBa60DdB133E91E9A4B5673624293d8F8",
    },
    arbitrum: {
        chainId: 10010,
        endpoint: "0x4d747149a57923beb89f22e6b7b97f7d8c087a00",
    },
    optimism: {
        chainId: 10011,
        endpoint: "0x72ab53a133b27fa428ca7dc263080807afec91b5",
    },
    fantom: {
        chainId: 10012,
        endpoint: "0x7dcAD72640F835B0FA36EFD3D6d3ec902C7E5acf",
    },
};

export const mainnets: Config = {
    ethereum: {
        chainId: 1,
        endpoint: "0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675",
    },
    binance: {
        chainId: 2,
        endpoint: "0x3c2269811836af69497E5F486A85D7316753cf62",
    },
    avalanche: {
        chainId: 6,
        endpoint: "0x3c2269811836af69497E5F486A85D7316753cf62",
    },
    polygon: {
        chainId: 9,
        endpoint: "0xf69186dfBa60DdB133E91E9A4B5673624293d8F8",
    },
    arbitrum: {
        chainId: 10,
        endpoint: "0x3c2269811836af69497E5F486A85D7316753cf62",
    },
    optimism: {
        chainId: 1,
        endpoint: "0x3c2269811836af69497E5F486A85D7316753cf62",
    },
    fantom: {
        chainId: 12,
        endpoint: "0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7",
    },
};
