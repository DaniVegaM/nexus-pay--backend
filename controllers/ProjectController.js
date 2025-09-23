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
            UserId: managerId  // Cambiar de managerId a UserId
        });

        // Obtener el proyecto con sus asociaciones
        const projectWithAssociations = await Project.findByPk(createdProject.id, {
            include: [
                { model: User, as: 'manager' },
                { model: Team, as: 'teams' }
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


export const addTeamToProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { teamId } = req.body;

        // Verificar que el proyecto existe
        const project = await Project.findByPk(projectId);
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // Verificar que el equipo existe
        const team = await Team.findByPk(teamId);
        if (!team) {
            return res.status(404).json({
                success: false,
                message: 'Team not found'
            });
        }

        // Verificar que el equipo no esté ya en otro proyecto
        if (team.ProjectId && team.ProjectId !== projectId) {
            return res.status(400).json({
                success: false,
                message: 'Team is already assigned to another project'
            });
        }

        // Asignar el equipo al proyecto
        await team.update({ ProjectId: projectId });

        // Obtener el proyecto actualizado con sus equipos
        const updatedProject = await Project.findByPk(projectId, {
            include: [
                { model: User, as: 'manager' },
                { model: Team, as: 'teams' }
            ]
        });

        res.status(200).json({
            success: true,
            message: 'Team added to project successfully',
            data: updatedProject
        });

    } catch (error) {
        console.error('Error adding team to project:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding team to project',
            error: error.message
        });
    }
};

export const removeTeamFromProject = async (req, res) => {
    try {
        const { projectId, teamId } = req.params;

        // Verificar que el equipo existe y pertenece al proyecto
        const team = await Team.findOne({
            where: {
                id: teamId,
                ProjectId: projectId
            }
        });

        if (!team) {
            return res.status(404).json({
                success: false,
                message: 'Team not found in this project'
            });
        }

        // Remover el equipo del proyecto
        await team.update({ ProjectId: null });

        res.status(200).json({
            success: true,
            message: 'Team removed from project successfully'
        });

    } catch (error) {
        console.error('Error removing team from project:', error);
        res.status(500).json({
            success: false,
            message: 'Error removing team from project',
            error: error.message
        });
    }
};


