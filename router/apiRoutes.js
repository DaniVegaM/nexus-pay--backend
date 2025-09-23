import express from 'express';
import { getMembers, postMember, updateSalaryMember, deleteMember } from '../controllers/MemberController.js'
import { getUsers, postUser, deleteUser, updateUser } from '../controllers/UserController.js';
import { getTeams, createTeam, deleteTeam } from '../controllers/TeamsController.js';
import { getProjects, getProjectById, postProject, deleteProject } from '../controllers/ProjectController.js';

const MEMBER_PATH = '/member'
const USER_PATH = '/user'
const TEAMS_PATH = '/teams'
const PROJECT_PATH = '/project'

const router = express.Router();

// Member endpoints
router.get(`${MEMBER_PATH}/`, getMembers);
router.post(`${MEMBER_PATH}/`, postMember );
router.delete(`${MEMBER_PATH}/:id`, deleteMember );
router.put(`${MEMBER_PATH}/:id`, updateSalaryMember );

// User endpoints
router.get(`${USER_PATH}/`, getUsers);
router.post(`${USER_PATH}/`, postUser );
router.delete(`${USER_PATH}/:id`, deleteUser );
router.put(`${USER_PATH}/:id`, updateUser );

// Team endpoints
router.get(`${TEAMS_PATH}/`, getTeams);
router.post(`${TEAMS_PATH}/`, createTeam)
router.delete(`${TEAMS_PATH}/:id`, deleteTeam)

// Project endpoints
router.get(`${PROJECT_PATH}/`, getProjects);
router.get(`${PROJECT_PATH}/:id`, getProjectById);
router.post(`${PROJECT_PATH}/`, postProject );
router.delete(`${PROJECT_PATH}/:id`, deleteProject );

export default router;