import { Member } from "../models/index.js";

export const getMembers = async (req, res) => {
    try {
        const members = await Member.findAll();
        res.json(members);
    } catch (error) {
        console.error("Error fetching members:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const postMember = async (req, res) => {
    try {
        const createdMember = await Member.create( req.body );
        
        const response_data = {
            name: createdMember.name,
            email: createdMember.email,
            walletAddress: createdMember.walletAddress,
            salary: createdMember.salary,
            rol: createdMember.rol
        }

        res.status(201).json({
            success: true,
            message: 'Member created successfully.',
            data: response_data
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: "Error while creating Member.",
            error: error.message
        });
    }
}

export const deleteMember = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedCount = await Member.destroy({ where: { id } });

        if (deletedCount === 0) {
            return res.status(404).json({ error: "Member not found." });
        }

        res.status(200).json({ message: "Member deleted successfully." });
    } catch (error) {
        console.error("Error deleting member:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}
