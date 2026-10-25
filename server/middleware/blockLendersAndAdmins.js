// Lenders are already verified and admins review requests, so neither can apply to become a lender.
export const blockLendersAndAdmins = (req, res, next) => {
    if (req.user.role === 'lender') {
        return res.status(403).json({ message: 'You are already a verified lender' });
    }
    if (req.user.role === 'admin') {
        return res.status(403).json({ message: 'Admins cannot apply to become a lender' });
    }
    next();
};
