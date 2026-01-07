# Coffee Clock ☕

An intelligent caffeine tracking app that visualizes your caffeine metabolism and helps you optimize your intake for better sleep and productivity.

## ✨ Features

- **Dashboard**: Real-time overview of your current caffeine levels.
- **Metabolism Visualization**: Interactive chart showing your caffeine "awake curve" and estimated sleep-safe time.
- **Quick Logging**: One-tap buttons for common coffee types (Espresso, Latte, Americano).
- **Secure Data**: Personal account system powered by Supabase.
- **Cloud Sync**: Access your data from any device.

## 🚀 Getting Started

### Prerequisites

1. Node.js (v18+)
2. A Supabase project

### Installation

1. Clone the repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure Environment Variables:
   Create a `.env` file in the root directory:

   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_supabase_anon_key
   ```

4. Database Setup:
   Run the SQL found in `db/tables.sql` in your Supabase SQL Editor.

5. Start Development Server:
   ```bash
   npm run dev
   ```

## 📝 License

MIT
