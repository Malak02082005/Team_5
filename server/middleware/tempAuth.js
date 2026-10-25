// TEMPORARY: will replace it with Martin's 
export const tempAuth = (req, res, next) => {
    const memberId = req.header('x-member-id');
    if (!memberId) {
        return res.status(401).json({ message: 'Not logged in' });
    }
    req.user = { id: memberId };

    next();
};
