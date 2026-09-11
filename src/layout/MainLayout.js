
// src/layout/MainLayout.js

import {
  Outlet,
  useNavigate,
  useLocation,
} from "react-router-dom";

import {
  FiHome,
  FiEdit3,
  FiUsers,
  FiUser,
} from "react-icons/fi";

function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="app-container">
      {/* 현재 선택된 페이지가 표시되는 영역 */}
      <Outlet />

      {/* 하단 네비게이션 */}
      <div className="bottom-nav">
        {/* 홈 */}
        <FiHome
          className={
            location.pathname === "/home"
              ? "active-nav"
              : ""
          }
          onClick={() =>
            navigate("/home")
          }
        />

        {/* 독후감 */}
        <FiEdit3
          className={
            location.pathname === "/write" ||
            location.pathname === "/write/detail"
              ? "active-nav"
              : ""
          }
          onClick={() =>
            navigate("/write")
          }
        />

        {/* 커뮤니티 */}
        <FiUsers
          className={
            location.pathname === "/community"
              ? "active-nav"
              : ""
          }
          onClick={() =>
            navigate("/community")
          }
        />

        {/* 프로필 */}
        <FiUser
          className={
            location.pathname === "/profile"
              ? "active-nav"
              : ""
          }
          onClick={() =>
            navigate("/profile")
          }
        />
      </div>
    </div>
  );
}

export default MainLayout;
