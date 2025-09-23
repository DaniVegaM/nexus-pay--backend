import { Project, User, Team } from "../models/index.js";

export const getProjects = async (req, res) => {
    try {
        const projects = await Project.findAll({
            include: [
                { model: User, as: 'manager' },
                { model: Team, as: 'teams' }
            ]
        });
        
        res.status(200).json(projects);
    } catch (error) {
        console.error('Error fetching projects: ', error.message)
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
};

export const getProjectById = async (req, res) => {
    try {
        const { id } = req.params;
        const project = await Project.findByPk(id, {
            include: [
                { model: User, as: 'manager' },
                { model: Team, as: 'team' }
            ]
        }); 

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        res.status(200).json(project);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch project' });
    }
}

export const postProject = async (req, res) => {
    try {
        const { managerId, ...projectData } = req.body;

        // Verificar que el usuario existe
        const user = await User.findByPk(managerId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const createdProject = await Project.create({
            ...projectData,
            managerId: managerId
        });

        // Obtener el proyecto con sus asociaciones
        const projectWithAssociations = await Project.findByPk(createdProject.id, {
            include: [
                { model: User, as: 'manager' }
            ]
        });

        res.status(201).json({
            success: true,
            message: 'Project created successfully.',
            data: projectWithAssociations
        });
    } catch (error) {
        console.error("Error creating project:", error);
        res.status(400).json({ 
            success: false,
            message: "Error while creating Project.",
            error: error.message 
        });
    }
}

export const deleteProject = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedCount = await Project.destroy({ where: { id } });

        if (deletedCount === 0) {
            return res.status(404).json({ error: "Project not found." });
        }

        res.status(200).json({ message: "Project deleted successfully." });
    } catch (error) {
        console.error("Error deleting project:", error);
        res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Error while deleting Project.",
        });
    }
};

