const { request, gql } = require('graphql-request');

const utils = require('../utils');

const url = `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_PROTOCOL}/subgraphs/id/CvSasxLYUvFbYyi7VXGhXL6PNgkZPoVDo2bo66ftEA2V`;

const query = gql`
    {
        pairs(first: 1000, orderBy: trackedReserveETH, orderDirection: desc block: {number: <PLACEHOLDER>}) {
            id
            reserve0
            reserve1
            volumeUSD
            token0 {
                symbol
                id
            }
            token1 {
                symbol
                id
            }

        }
    }
`;

const queryPrior = gql`
  {
    pairs (first: 1000 orderBy: trackedReserveETH orderDirection: desc block: {number: <PLACEHOLDER>}) { 
      id 
      volumeUSD 
    }
  }
`;

//

const getPoolsData = async (
  chainString,
  url,
  query,
  queryPrior,
  version,
  timestamp
) => {
  const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
    url,
  ]);

  const [_, blockPrior7d] = await utils.getBlocks(
    chainString,
    timestamp,
    [url],
    604800
  );

  // pull data
  let queryC = query;
  let dataNow = await request(url, queryC.replace('<PLACEHOLDER>', block));
  dataNow = dataNow.pairs;

  // pull 24h offset data to calculate fees from swap volume
  let queryPriorC = queryPrior;
  let dataPrior = await request(
    url,
    queryPriorC.replace('<PLACEHOLDER>', blockPrior)
  );
  dataPrior = dataPrior.pairs;

  // 7d offset
  const dataPrior7d = (
    await request(url, queryPriorC.replace('<PLACEHOLDER>', blockPrior7d))
  ).pairs;

  // calculate tvl
  dataNow = await utils.tvl(dataNow, chainString);
  // calculate apy
  dataNow = dataNow.map((el) => utils.apy(el, dataPrior, dataPrior7d, version));

  return dataNow.map((p) => {
    const symbol = utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`);
    const underlyingTokens = [p.token0.id, p.token1.id];
    const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
    const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];
    const chain = chainString === 'ethereum' ? 'mainnet' : chainString;

    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project: 'verse',
      symbol,
      tvlUsd: p.totalValueLockedUSD,
      apyBase: p.apy1d,
      apyBase7d: p.apy7d,
      underlyingTokens,
      url: 'https://verse.bitcoin.com/pools/',
      volumeUsd1d: p.volumeUSD1d,
      volumeUsd7d: p.volumeUSD7d,
    };
  });
};

const verseYield = async (timestamp = null) => {
  const data = await getPoolsData(
    'ethereum',
    url,
    query,
    queryPrior,
    'v2',
    timestamp
  );

  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: verseYield,
};
