## Setup

First, install Node.js 16 and Rust. We recommend using [nvm](https://github.com/nvm-sh/nvm) to manage your Node.js versions.

Clone the repo.

```bash
git clone https://github.com/holonym-foundation/holonym-relayer.git
```

Install dependencies with npm.

```bash
npm install
```

Set environment variables. You might need to get in touch with the team to get the values of some of these variables.

```bash
cp .env.example .env
```

Run the development server.

```bash
npm run dev-server
```

In another terminal, run the daemon.

```bash
npm run dev-daemon
```

## Testing
A local hardhat environment is used for testing. All of the smart contracts in contracts/ are used here solely for testing purposes. Call `npm run test` to test