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
        // Mapear teamId a TeamId si viene en minúscula
        const memberData = { ...req.body };
        if (memberData.teamId && !memberData.TeamId) {
            memberData.TeamId = memberData.teamId;
            delete memberData.teamId;
        }
        
        const createdMember = await Member.create( memberData );
        
        const response_data = {
            id: createdMember.id,
            name: createdMember.name,
            email: createdMember.email,
            walletAddress: createdMember.walletAddress,
            salary: createdMember.salary,
            rol: createdMember.rol,
            TeamId: createdMember.TeamId
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

export const updateSalaryMember = async (req, res) => {
    try {
        const { id } = req.params;
        const { salary } = req.body;

        const member = await Member.findByPk(id);
        if (!member) {
            return res.status(404).json({ error: "Member not found." });
        }

        member.salary = salary;
        await member.save();

        res.status(200).json({
            success: true,
            message: "Member salary updated successfully.",
            data: member
        });
    } catch (error) {
        console.error("Error updating member salary:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}