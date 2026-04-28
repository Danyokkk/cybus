# 🚌 CyBus - Live Cyprus Bus Tracker

CyBus is a high-performance, real-time bus tracking application designed for the people of Cyprus. Built with **Next.js**, **Express**, and **Socket.io**, it provides seamless tracking, route planning, and arrival timetables with a premium, mobile-first interface.

---

## 🚀 Key Features

- **📍 Real-time Tracking**: Live locations of all public buses in Cyprus (EMEL, CPT, OSYPA, OSEA, etc.) via GTFS-Realtime.
- **🧭 Smart Route Planner**: Find the best connection between any two points in Cyprus, including transfers.
- **⏰ Live Timetables**: Precise arrival predictions for every bus stop on the island.
- **🗺️ Interactive Map**: Optimized for performance with smooth bus movement and smart viewport filtering.
- **📱 PWA Ready**: Installable on iOS and Android for a native app experience.
- **🌍 Multi-language**: Support for English, Russian, and Greek.

---

## 🛠 Technology Stack

- **Frontend**: Next.js 15, Leaflet, React Leaflet, Socket.io Client.
- **Backend**: Node.js, Express, Socket.io Server, GTFS Realtime Bindings.
- **Optimization**: Compression, Helmet, Rate Limiting, Memoization, and Viewport Filtering.
- **Deployment**: Optimized for Render (Backend) and Vercel (Frontend).

---

## 📦 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Danyokkk/cybus.git
   cd cybus
   ```

2. **Backend Setup**:
   ```bash
   cd bus-tracker/backend
   npm install
   npm start
   ```

3. **Frontend Setup**:
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```

4. **Environment Variables**:
   Create a `.env.local` in `bus-tracker/frontend`:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3001
   ```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author

Created by **daan1k**. Developed with passion for the Cyprus tech community.
