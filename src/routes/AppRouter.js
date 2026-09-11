// src/routes/AppRouter.js

import {
  Routes,
  Route,
} from "react-router-dom";

import MainLayout from "../layout/MainLayout";

import Splash from "../pages/Splash";
import Login from "../pages/Login";
import Signup from "../pages/Signup";

import Home from "../pages/Home";
import AIWriteList from "../pages/AIWriteList";
import AIWrite from "../pages/AIWrite";

import Community from "../pages/Community";
import MeetingRoom from "../pages/MeetingRoom";
import Profile from "../pages/Profile";
import Review from "../pages/Review";
import OtherProfile from "../pages/OtherProfile";
function AppRouter() {
  return (
    <Routes>
      {/* 시작 */}
      <Route
        path="/"
        element={<Splash />}
      />

      {/* 로그인 */}
      <Route
        path="/login"
        element={<Login />}
      />

      {/* 회원가입 */}
      <Route
        path="/signup"
        element={<Signup />}
      />

      {/* 앱 내부 */}
      <Route element={<MainLayout />}>
        <Route
          path="/home"
          element={<Home />}
        />

        <Route 
          path="/write" 
          element={<AIWriteList />} />
        <Route 
          path="/write/detail" 
          element={<AIWrite />} />
        <Route
          path="/community"
          element={<Community />}
        />

        <Route
          path="/meeting"
          element={<MeetingRoom />}
        />

        <Route
          path="/profile"
          element={<Profile />}
        />

        <Route
          path="/review"
          element={<Review />}
        />
        <Route
          path="/other-profile"
          element={<OtherProfile />}
        />
      </Route>
    </Routes>
  );
}

export default AppRouter;