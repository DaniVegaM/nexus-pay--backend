import User from './UserModel.js';
import Member from './MemberModel.js';
import Project from './ProjectModel.js';
import Team from './TeamModel.js';

User.hasMany(Project, {
  as: 'projects'
});
Project.belongsTo(User, {
  as: 'manager'
});

Team.hasMany(Member, {
  as: 'members'
}, { as: 'members' });
Member.belongsTo(Team, {
  as: 'team'
});

Project.hasMany(Team, {
  as: 'teams'
});
Team.belongsTo(Project, {
  as: 'project'
});

export {
  User,
  Member,
  Project,
  Team,
};
