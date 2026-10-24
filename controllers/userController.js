// controllers/userController.js - the functions that handle user requests.

// GET /api/v1/users/me - sends back the user who is logged in.
function getMe(req, res) {
  // The "protect" guard already found this user from the login cookie
  // and put it in req.user. We only have to send it back.
  // The user model removes the private fields (password and so on) when it becomes JSON.
  res.status(200).json({
    status: 'success',
    data: {
      user: req.user,
    },
  });
}

module.exports = {
  getMe,
};