import User from './UserModel.js';
import Member from './MemberModel.js';
import Project from './ProjectModel.js';
import Team from './TeamModel.js';

User.hasMany(Project, {
  as: 'projects',
  foreignKey: 'UserId'
});
Project.belongsTo(User, {
  as: 'manager',
  foreignKey: 'UserId'
});

Team.hasMany(Member, {
  as: 'members',
  foreignKey: 'TeamId'
});
Member.belongsTo(Team, {
  as: 'team',
  foreignKey: 'TeamId'
});

Project.hasMany(Team, {
  as: 'teams',
  foreignKey: 'ProjectId'
});
Team.belongsTo(Project, {
  as: 'project',
  foreignKey: 'ProjectId'
});

export {
  User,
  Member,
  Project,
  Team,
};
