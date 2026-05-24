function tokenAuth(token) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token;

    if (queryToken === token || (authHeader && authHeader === `Bearer ${token}`)) {
      return next();
    }

    res.status(401).json({ error: 'Unauthorized' });
  };
}

module.exports = { tokenAuth };
