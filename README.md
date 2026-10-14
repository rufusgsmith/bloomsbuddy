# Bloomsbuddy

UCL students waste the gaps between lectures. Bloomsbuddy finds the gaps in your timetable and uses Claude to suggest the best thing to do in each one: a top pick and two alternatives, each with a reason. Picks can be a study spot, a society event, a rest, lunch, going home, or something from your to-do list.

You add your timetable and Moodle deadlines by uploading screenshots, which Claude reads. Everything is saved in your browser, with no account or login.

Built for the UCL Claude Campus Hackathon (Better Student Life track).

## Run it locally

You need:

- [Node.js](https://nodejs.org) 20.9 or newer
- An Anthropic API key from [console.anthropic.com](https://console.anthropic.com). API usage is billed to your account.

1. Clone the repo and install the dependencies:

   ```bash
   git clone https://github.com/rufussm1th/bloomsbuddy.git
   cd bloomsbuddy
   npm install
   ```

2. Copy the example env file:

   ```bash
   cp .env.example .env.local
   ```

   Open `.env.local` and paste your key after `ANTHROPIC_API_KEY=`. Git ignores `.env.local`, so your key stays on your machine. Never commit it.

3. Start the dev server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

No timetable to hand? Choose "Skip, show the demo week" in setup to try a sample student week. Without an API key the app still opens, but recommendations and screenshot reading won't work.
