/**
 * Truffle configuration for the Student Certificate Verification Project.
 *
 * This configuration explicitly connects to a local Ganache instance
 * and specifies the deployer account to avoid checksum errors.
 */

module.exports = {
  // 1. Contract build directory
  contracts_build_directory: "./build/contracts",

  // 2. Specify the network configurations
  networks: {
    // Development network connected to Ganache
    development: {
      host: "127.0.0.1",   // Localhost (or IP address of your Ganache instance)
      port: 7545,          // Ganache's default port
      network_id: "5777",  // Explicitly matching Ganache's default Network ID
      gas: 6721975,        // Gas limit (Ganache's default)
      // CRITICAL FIX: Explicitly setting the 'from' address to the first Ganache account
      from: "0x9C9ad0F8cbCADbDf2f8E548730b5Cc6F826633A2", 
    },
  },

  // 3. Configure the compiler (Solidity)
  compilers: {
    solc: {
      version: "0.8.0",    // Matches the pragma in CertificateRegistry.sol
      settings: {
        optimizer: {
          enabled: true,
          runs: 200        // Optimize for 200 runs
        },
        evmVersion: "istanbul" 
      }
    }
  },

  // 4. Configure file paths
  contracts_directory: './contracts/',
  migrations_directory: './migrations/',
};