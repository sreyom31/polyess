const ethers = require('ethers');
const axios = require('axios');
const TrackerState = require('../models/tracker_state')
const EventDeadLetterQueue = require('../models/event_deadletter_queue');
const TokenAbi = require('../abi/Token.json')
ALCHMEY_API=process.env.ALCHMEY_API
const provider = new ethers.providers.JsonRpcProvider(ALCHMEY_API);
const apiEndPoint = process.env.API_ENDPOINT

const loadOrderContract = () => {
  let abi = TokenAbi;
  let address = process.env.CONTRACT_ADDRESS;
  return new ethers.Contract(address, abi, provider);
}

const token = loadOrderContract();


const callAPI = async (endpoint, data) => {
  try {
    await axios({
      method: 'post',
      url: apiEndPoint + endpoint,
      data,
    })
  } catch(err) {
    // If bad request save to dead letter queue
    if (err && err.response && err.response.status === 400) {
      console.warn(`[bad-request] add event to dead-letter-queue, txHash: ${data.transactionHash}`);
      await EventDeadLetterQueue.create({contract: process.env.CONTRACT_ADDRESS, event: data})
      return;
    }
    // If other reasons (server unreachable for example) throw and block;
    throw err;
  }
}

const processTokenEvents = async (startFromBlock) => {
  const currentBlock = await provider.getBlockNumber();
  let lastBlockProcessed = startFromBlock;

  console.info(`Tracking block: ${startFromBlock} - ${currentBlock}`)

  const handleHessBought = async (event) => {
    return callAPI('hessBought', event)
  }
  const handleHessDestroyed = async (event) => {
    return callAPI('hessDestroyed', event)
  }
  const handleHessMinted = async (event) => {
    return callAPI('hessMinted', event)
  }

  const handleNftMinted = async (event) => {
    return callAPI('nftMinted', event)
  }
  const handleNftTransfer = async (event) => {
    return callAPI('nftTransfer', event)
  }
  
  const handleHessStaked = async (event) => {
    return callAPI('hessStaked', event)
  }
  const handleNftStaked = async (event) => {
    return callAPI('nftStaked', event)
  }

  const handleHessWon = async (event) => {
    return callAPI('hessWon', event)
  }
  const handleNftWon = async (event) => {
    return callAPI('nftWon', event)
  }
 
  async function handleEvents(events) {

    for (const event of events) {
      // // Order lifecycle events
      if (event.event === "Hess_Buy") {
        console.log(`[HessBought] tx: ${event.transactionHash}, block: ${event.blockNumber}`)
        await handleHessBought(event);
      }
      if (event.event === "ex_eth_hess") {
        console.log(`[HessDestroyed] tx: ${event.transactionHash}, block: ${event.blockNumber}`)
        await handleHessDestroyed(event);
      }
      if (event.event === "mint_token") {
        console.log(`[HessMinted] tx: ${event.transactionHash}, block: ${event.blockNumber}`)
        await handleHessMinted(event);
      }
      if (event.event === "mint_NFT") {
        console.log(`[nftMinted] tx: ${event.transactionHash}, block: ${event.blockNumber}`)
        await handleNftMinted(event);
      }
      if (event.event === "ex_NFT") {
        console.log(`[nftTransfer] tx: ${event.transactionHash}, block: ${event.blockNumber}`)
        await handleNftTransfer(event);
      }
      if (event.event === "TOKEN_staking") {
        console.log(`[HessStaked] tx: ${event.transactionHash}, block: ${event.blockNumber}`)
        await handleHessStaked(event);
      }
     
      if (event.event === "NFT_STAKE") {
        console.log(`[nftStaked] tx: ${event.transactionHash}, block: ${event.blockNumber}`)
        await handleNftStaked(event)
      }
      if (event.event === "TOKEN_win") {
        console.log(`[HessWon] tx: ${event.transactionHash}, block: ${event.blockNumber}`)
        await handleHessWon(event)
      }
      if (event.event === "NFT_win") {
        console.log(`[nftWon] tx: ${event.transactionHash}, block: ${event.blockNumber}`)
        await handleNftWon(event)
      }
    

      lastBlockProcessed = event.blockNumber + 1;
    }
  }

  try {
    const pastEvents = await token.queryFilter('*', startFromBlock, currentBlock);
    const batches = pastEvents.reduce((batchArray, item, index) => {
      const chunkIndex = Math.floor(index / 10)

      if(!batchArray[chunkIndex]) {
        batchArray[chunkIndex] = [] // start a new chunk
      }

      batchArray[chunkIndex].push(item)

      return batchArray
    }, [])

    batches.length && console.log(`Event batches to run ${batches.length}`);
    let runBatch = 0;
    await new Promise((resolve) => {
      let interval = setInterval(async () => {
        if (runBatch >= batches.length) {
          clearInterval(interval);
          return resolve()
        }

        await handleEvents(batches[runBatch]);
        await TrackerState.updateOne({contractAddress: process.env.CONTRACT_ADDRESS}, {lastBlockProcessed});
        console.log(`[PastEvents] Proccesed batch ${runBatch + 1} of ${batches.length}`);
        console.log(`[PastEvents] LastBlockProcessed: ${lastBlockProcessed}`);

        runBatch += 1;
      }, 5000);
    });
  } catch (err) {
    console.error(err.message);
  }
}

module.exports = processTokenEvents
