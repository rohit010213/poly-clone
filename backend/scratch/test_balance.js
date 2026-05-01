const { ethers } = require('ethers');

async function test() {
  const RPC = 'https://rpc.ankr.com/polygon';
  const TOKEN = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB';
  const WALLET = '0xAcA70d04B57996DF176080Fc72629aacb020A7FF';
  
  const provider = new ethers.JsonRpcProvider(RPC);
  const abi = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'];
  const contract = new ethers.Contract(TOKEN, abi, provider);
  
  try {
    const bal = await contract.balanceOf(WALLET);
    const dec = await contract.decimals();
    console.log('Balance (raw):', bal.toString());
    console.log('Decimals:', dec);
    console.log('Balance (formatted):', ethers.formatUnits(bal, dec));
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
