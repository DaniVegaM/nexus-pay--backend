import express from 'express';
import { getMembers, postMember } from '../controllers/MemberController.js'
import { getUsers, postUser, deleteUser, updateUser } from '../controllers/UserController.js';

const MEMBER_PATH = '/member'
const USER_PATH = '/user'

const router = express.Router();

// Member endpoints
router.get(`${MEMBER_PATH}/`, getMembers);
router.post(`${MEMBER_PATH}/`, postMember );
router.delete(`${MEMBER_PATH}/:id`, postMember );

// User endpoints
router.get(`${USER_PATH}/`, getUsers);
router.post(`${USER_PATH}/`, postUser );
router.delete(`${USER_PATH}/:id`, deleteUser );
router.put(`${USER_PATH}/:id`, updateUser );

export default router;