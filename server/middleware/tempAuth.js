// TEMPORARY: replace with Martin's auth middleware once it is merged.
export const tempAuth = (req, res, next) => {
    const userId = req.header('x-user-id');
    if (!userId) {
        return res.status(401).json({ message: 'Not logged in' });
    }
    req.user = { id: userId };
    next();
};
