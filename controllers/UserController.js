import { User } from '../models/index.js';

export const getUsers = async (req, res) => {
    try {
        const users = await User.findAll();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    } 
};

export const postUser = async (req, res) => {
    try {
        const createdUser = await User.create(req.body);
        
        // TODO: quitar campos de la respuesta
        
        res.status(201).json({
            success: true,
            message: 'User created successfully.',
            data: createdUser
        });
    } catch (error) {
        res.status(400).json({ 
            success: false,
            message: "Error while creating User.",
            error: 'Failed to create user' 
        });
    }   
};

export const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedCount = await User.destroy({ where: { id } });

        if (deletedCount === 0) {
            return res.status(404).json({ error: "User not found." });
        }

        res.status(200).json({ message: "User deleted successfully." });
    } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).json({ 
            success: false,
            error: "Internal Server Error",
            message: "Error while deleting User.",
        });
    }
}

export const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const [ updated, row ] = await User.update(req.body, { where: { id } });
        
        if (updated === 0) {
            return res.status(404).json({ error: "User not found." });
        }

        res.status(200).json({
            success: true,
            message: "User updated successfully.",
            data: row
        });
    }
    catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({
            success: false,
            message: "Error while updating User.",
            error: "Internal Server Error"
        });
    }
};