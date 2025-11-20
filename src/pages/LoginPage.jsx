import React, { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth, db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "signup"

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmitLogin = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await signInWithEmailAndPassword(auth, form.email, form.password);
    } catch (err) {
      console.error(err);
      setError("Login failed. Check your email and password.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitSignup = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    if (!form.fullName.trim()) {
      setError("Please enter your name.");
      setSubmitting(false);
      return;
    }

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      setSubmitting(false);
      return;
    }

    try {
      // Create auth user
      const cred = await createUserWithEmailAndPassword(
        auth,
        form.email,
        form.password
      );

      // Create Firestore profile doc with default role "agent"
      const uid = cred.user.uid;
      await setDoc(doc(db, "users", uid), {
        fullName: form.fullName.trim(),
        email: form.email.toLowerCase(),
        role: "agent",
        createdAt: serverTimestamp(),
      });

      // onAuthStateChanged in AuthContext will pick this up and redirect
    } catch (err) {
      console.error(err);
      let msg = "Account creation failed.";
      if (err.code === "auth/email-already-in-use") {
        msg = "That email is already in use.";
      } else if (err.code === "auth/invalid-email") {
        msg = "Please enter a valid email address.";
      } else if (err.code === "auth/weak-password") {
        msg = "Password is too weak.";
      }
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const isLogin = mode === "login";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-xl shadow-md p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 bg-wrcYellow rounded flex items-center justify-center text-wrcBlack font-bold text-lg">
            W
          </div>
          <div>
            <div className="font-bold text-base text-wrcBlack">
              Weichert Realtors Cornerstone
            </div>
            <div className="text-xs text-gray-600">
              Lead Management {isLogin ? "Login" : "Create Account"}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex text-xs font-semibold mb-4 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 py-2 text-center ${
              isLogin
                ? "text-wrcBlack border-b-2 border-wrcYellow"
                : "text-gray-500"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 py-2 text-center ${
              !isLogin
                ? "text-wrcBlack border-b-2 border-wrcYellow"
                : "text-gray-500"
            }`}
          >
            Create account
          </button>
        </div>

        {/* Forms */}
        {isLogin ? (
          <form onSubmit={handleSubmitLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wrcYellow focus:border-wrcYellow"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wrcYellow focus:border-wrcYellow"
                required
              />
            </div>

            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-wrcBlack text-wrcYellow font-semibold text-sm py-2.5 rounded-lg hover:bg-black disabled:opacity-60"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmitSignup} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Full name
              </label>
              <input
                name="fullName"
                type="text"
                value={form.fullName}
                onChange={handleChange}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wrcYellow focus:border-wrcYellow"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wrcYellow focus:border-wrcYellow"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wrcYellow focus:border-wrcYellow"
                required
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Minimum 6 characters.
              </p>
            </div>

            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-wrcBlack text-wrcYellow font-semibold text-sm py-2.5 rounded-lg hover:bg-black disabled:opacity-60"
            >
              {submitting ? "Creating account..." : "Create account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
