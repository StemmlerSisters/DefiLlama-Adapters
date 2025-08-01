const { function_view } = require("../helper/chain/aptos");
const { compoundExports2 } = require("../helper/compound")
const { mergeExports } = require("../helper/utils")

/* LayerBank V2 */
const v2Config = {
  linea: '0x009a0b7C38B542208936F1179151CD08E2943833',
  scroll: '0xEC53c830f4444a8A56455c6836b5D2aA794289Aa',
  manta: '0xB7A23Fc0b066051dE58B922dC1a08f33DF748bbf',
  mode: '0x80980869D90A737aff47aBA6FbaA923012C1FF50',
  zklink: '0x4Ac518DbF0CC730A1c880739CFa98fe0bB284959',
  bsquared: '0x72f7a8eb9F83dE366AE166DC50F16074076C3Ea6',
  bob: '0x77cabFd057Bd7C81c011059F1bf74eC1fBeDa971',
  btr: '0xf1E25704e75dA0496B46Bf4E3856c5480A3c247F',
  mint: '0x0f225d10dd29D4703D42C5E93440F828bf04D150',
  taiko: '0x803a61d82BaD2743bE35Be5dC6DEA0CccE82C056',
  bsc: '0x8eFdD7396b83Cd53ae7555224A30c41b1A100ffA',
  morph: '0xD48c646CF9B011D97E31770873985ADD8ed7371c',
  rsk: '0xc30991623fb2a63E6e1B59A29987E1EEE57447bF',
  hemi: '0x16B3A05f1adaCa8F028AAd7C5B0475cC512a0619',
}

const abis = {
  getAllMarkets: "address[]:allMarkets",
  totalBorrows: "uint256:totalBorrow",
}

Object.keys(v2Config).forEach(chain => {
  const comptroller = v2Config[chain]
  module.exports[chain] = compoundExports2({ comptroller, abis, })
})

module.exports = mergeExports([module.exports, {
  linea: compoundExports2({ comptroller: '0x43Eac5BFEa14531B8DE0B334E123eA98325de866', abis, }),
}])

/* LayerBank Move */

// LayerBank pool contract address
const LAYERBANK_POOL_CONTRACT = "0xf257d40859456809be19dfee7f4c55c4d033680096aeeb4228b7a15749ab68ea";

/**
 * Fetches pool data from LayerBank
*/
async function fetchPoolData() {
  try {
    const poolData = await function_view({
      functionStr: `${LAYERBANK_POOL_CONTRACT}::ui_pool_data_provider_v3::get_reserves_data`,
      chain: "move"
    });
    return poolData;
  } catch (error) {
    return [[], {}]; // Return default value in case of error
  }
}

module.exports.move = {
  tvl: async (api) => {
    // Fetch pool data
    const poolData = await fetchPoolData();
    const assets = poolData[0] || [];

    // Calculate TVL for each asset and add to balances
    assets.forEach(asset => {
      api.add(asset.underlying_asset, asset.available_liquidity);
    });
  },
  borrowed: async (api) => {
    // Fetch pool data
    const poolData = await fetchPoolData();
    const assets = poolData[0] || [];

    // Calculate TVL for each asset and add to balances
    assets.forEach(asset => {
      api.add(asset.underlying_asset, asset.total_scaled_variable_debt);
    });
  }
};

/* LayerBank V3 */

const v3Abi = {
  getReserveTokensAddresses: "function getReserveTokensAddresses(address asset) view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress)",
  getAllReservesTokens: "function getAllReservesTokens() view returns ((string symbol, address tokenAddress)[])",
  getReserveData: "function getReserveData(address asset) view returns (uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)",
};

const v3Config = {
  plume_mainnet: [`0xF9642C3B35Cd4Ccd55D22Fb2B35fcc31c5E0B62E`],
  hemi: [`0x8D45801736F3504BEfA35ABEf8bc7a1C4d610651`],
  nibiru: [`0x7F5f9E5D4643B4333464c18d072167B452C20d28`],
  bob: [`0xeb1Bea032d0DDCAFd29fb3b8c33A67BCAfCaFD8c`],
  rsk: ['0x47C1ef207d49cfC519F48b8251857CA6BE6c2caf'],
};

const fetchReserveData = async (api, poolDatas, isBorrowed) => {
  const reserveTokens = await api.multiCall({ calls: poolDatas, abi: v3Abi.getAllReservesTokens });
  const calls = []

  poolDatas.map((pool, i) => {
    reserveTokens[i].forEach(({ tokenAddress }) => calls.push({ target: pool, params: tokenAddress }));
  });
  const reserveData = await api.multiCall({ abi: isBorrowed ? v3Abi.getReserveData : v3Abi.getReserveTokensAddresses, calls, })
  const tokensAndOwners = []
  reserveData.forEach((data, i) => {
    const token = calls[i].params
    if (isBorrowed) {
      api.add(token, data.totalVariableDebt)
      api.add(token, data.totalStableDebt)
    } else
      tokensAndOwners.push([token, data.aTokenAddress])
  })

  if (isBorrowed) return api.getBalances()
  return api.sumTokens({ tokensAndOwners })
}

const v3Exports = {};

Object.keys(v3Config).forEach((chain) => {
  const poolDatas = v3Config[chain];
  v3Exports[chain] = {
    tvl: (api) => fetchReserveData(api, poolDatas),
    borrowed: (api) => fetchReserveData(api, poolDatas, true),
  };
});

module.exports = mergeExports([module.exports, v3Exports]);