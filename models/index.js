import User from './UserModel.js';
import Member from './MemberModel.js';
import Project from './ProjectModel.js';
import Team from './TeamModel.js';

User.hasMany(Project);
Project.belongsTo(User);

Team.hasMany(Member);
Member.belongsTo(Team);

Project.hasMany(Team);
Team.belongsTo(Project);

export {
  User,
  Member,
  Project,
  Team,
};
