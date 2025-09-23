import { Member, Team, Project } from "../models/index.js";
import { Sequelize } from "sequelize";

export const getTeams = async (req, res) => {
    try {
        // Obtener equipos con sus miembros y proyecto asociado
        const teams = await Team.findAll({
            include: [
                { 
                    model: Member, 
                    as: 'members', 
                    attributes: ['id', 'name', 'email', ['salary', 'distributionValue'], 'rol', 'walletAddress'],
                    required: false // LEFT JOIN para incluir equipos sin miembros
                },
                {
                    model: Project,
                    as: 'project',
                    attributes: ['id', 'name', 'total'],
                    required: false // LEFT JOIN para incluir equipos sin proyecto
                }
            ]
        });

        // Agregar los campos totalMembers y balance a cada equipo
        const teamsWithCount = teams.map(team => {
            const teamData = team.toJSON();
            const totalMembers = teamData.members ? teamData.members.length : 0;
            
            // Calcular balance: (porcentaje del equipo / 100) * total del proyecto
            let balance = 0;
            if (teamData.project && teamData.project.total && teamData.percentage) {
                balance = (teamData.percentage / 100) * teamData.project.total;
            }
            
            return {
                ...teamData,
                Project: teamData.project, // Renombrar de 'project' a 'Project' para mantener consistencia
                project: undefined, // Eliminar el campo original
                totalMembers,
                balance: parseFloat(balance.toFixed(2)) // Redondear a 2 decimales
            };
        });

        res.json(teamsWithCount);
    } catch (error) {
        console.error("Error fetching members:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const createTeam = async (req, res) => {
    try {
        const { name, description, percentage = 0.0 } = req.body;
        // Crear el equipo
        const newTeam = await Team.create({
            name,
            description,
            percentage
        });

        res.status(201).json({
            success: true,
            message: "Team created successfully.",
            data: newTeam
        });
    } catch (error) {
        console.error("Error creating team:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}

export const deleteTeam = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar si el equipo existe
        const team = await Team.findByPk(id);
        if (!team) {
            return res.status(404).json({ error: "Team not found." });
        }

        // Primero eliminar todos los miembros asociados al equipo
        const deletedMembersCount = await Member.destroy({ 
            where: { TeamId: id } 
        });

        // Luego eliminar el equipo
        const deletedTeamCount = await Team.destroy({ where: { id } });

        res.status(200).json({ 
            message: "Team and associated members deleted successfully.",
            deletedMembers: deletedMembersCount,
            deletedTeam: deletedTeamCount
        });
    } catch (error) {
        console.error("Error deleting team:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}